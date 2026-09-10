const crypto = require('crypto');
const logger = require('../../utils/logger');
const crushRepo = require('./crush.repository');
const { CRUSH_CURVE_RATE, CRUSH_MAX_MULTIPLIER, CRUSH_MIN_AUTO_CASHOUT, DEFAULT_STAKE_LIMITS_PAISE } = require('../game.config');

const RoundStatus = { CREATED: 'CREATED', BETTING_OPEN: 'BETTING_OPEN', BETTING_CLOSED: 'BETTING_CLOSED', FLYING: 'FLYING', CRASHED: 'CRASHED', SETTLED: 'SETTLED' };

class CrushEngine {
  constructor() { this.currentRound = null; this.flyingStartedAt = null; }

  deriveCrashPoint(serverSeed, roundId) {
    if (!serverSeed || !roundId) throw new Error('Cannot derive crash point without seed and round id');
    const hash = crypto.createHmac('sha256', serverSeed).update(roundId).digest('hex');
    const hInt = parseInt(hash.substring(0, 8), 16);
    let crashPoint = 1.0;
    if (hInt % 33 !== 0) {
      const raw = (100 * 100) / ((hInt % 100) + 1);
      crashPoint = Math.max(1.0, Math.min(CRUSH_MAX_MULTIPLIER, parseFloat((raw / 100).toFixed(2))));
    }
    return crashPoint;
  }

  _attachPublicSerialization(round) {
    if (!round || typeof round !== 'object') return round;
    Object.defineProperty(round, 'toJSON', {
      enumerable: false,
      configurable: true,
      value: function () {
        const safe = { ...this };
        if (this.status !== RoundStatus.CRASHED && this.status !== RoundStatus.SETTLED) {
          delete safe.serverSeed;
          delete safe.crashPoint;
        }
        return safe;
      },
    });
    return round;
  }

  async createRound() {
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    const roundId = `crush_r_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
    const crashPoint = this.deriveCrashPoint(serverSeed, roundId);
    const now = Date.now();
    const newRound = { roundId, gameId: 'crush', status: RoundStatus.CREATED, serverSeedHash, serverSeed, crashPoint, currentMultiplier: 1.0, createdAt: new Date(now).toISOString(), bettingClosesAt: new Date(now + 10000).toISOString(), endedAt: null };
    await crushRepo.createRoundInDb(roundId, serverSeed, serverSeedHash, crashPoint);
    this.currentRound = this._attachPublicSerialization(newRound);
    this.flyingStartedAt = null;
    logger.info('Crush round created', { roundId });
    return this.currentRound;
  }

  async openBetting() {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.CREATED) await this.createRound();
    this.currentRound.status = RoundStatus.BETTING_OPEN;
    await crushRepo.updateRoundInDb(this.currentRound.roundId, RoundStatus.BETTING_OPEN);
    logger.info('Crush betting opened', { roundId: this.currentRound.roundId });
    return this.currentRound;
  }

  async placeBet({ userId, stakePaise, autoCashoutMultiplier, idempotencyKey }) {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.BETTING_OPEN) { const e = new Error('Betting is closed for current Crush round'); e.statusCode = 409; throw e; }
    let autoTarget = null;
    if (autoCashoutMultiplier !== undefined && autoCashoutMultiplier !== null && autoCashoutMultiplier !== '') {
      autoTarget = parseFloat(autoCashoutMultiplier);
      if (!Number.isFinite(autoTarget) || autoTarget < CRUSH_MIN_AUTO_CASHOUT) { const e = new Error(`Auto-cashout multiplier must be at least ${CRUSH_MIN_AUTO_CASHOUT}`); e.statusCode = 400; throw e; }
      if (autoTarget > CRUSH_MAX_MULTIPLIER) autoTarget = CRUSH_MAX_MULTIPLIER;
    }
    const stakeLimits = await crushRepo.getStakeLimits('crush', DEFAULT_STAKE_LIMITS_PAISE);
    const rawKey = idempotencyKey || `crush_req_${crypto.randomUUID()}`;
    const scopedIdempotencyKey = crypto.createHash('sha256').update(`${userId}:${String(rawKey)}`).digest('hex');
    return crushRepo.placeBetInDb({ userId, roundId: this.currentRound.roundId, stakePaise, autoCashoutMultiplier: autoTarget, idempotencyKey: scopedIdempotencyKey, stakeLimits });
  }

  computeMultiplier(elapsedMs) {
    if (!this.currentRound) return 1.0;
    const elapsedSec = Math.max(0, elapsedMs) / 1000;
    const raw = Math.exp(CRUSH_CURVE_RATE * elapsedSec);
    return parseFloat(Math.min(this.currentRound.crashPoint, raw).toFixed(2));
  }

  getCurrentMultiplier() { return (!this.currentRound || this.currentRound.status !== RoundStatus.FLYING || !this.flyingStartedAt) ? 1.0 : this.computeMultiplier(Date.now() - this.flyingStartedAt); }

  isCrashed() {
    if (!this.currentRound || !this.flyingStartedAt) return false;
    const elapsedSec = (Date.now() - this.flyingStartedAt) / 1000;
    return Math.exp(CRUSH_CURVE_RATE * elapsedSec) >= this.currentRound.crashPoint;
  }

  async cashoutBet({ betId, userId }) {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.FLYING) { const e = new Error('Cashout is only available while rocket is flying'); e.statusCode = 409; throw e; }
    const serverMultiplier = this.getCurrentMultiplier();
    if (serverMultiplier >= this.currentRound.crashPoint) { const e = new Error('Rocket crashed before cashout'); e.statusCode = 409; throw e; }
    return crushRepo.cashoutBetInDb({ betId, userId, roundId: this.currentRound.roundId, cashoutMultiplier: serverMultiplier });
  }

  async processAutoCashouts() {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.FLYING) return [];
    return crushRepo.processAutoCashoutsInDb(this.currentRound.roundId, this.getCurrentMultiplier());
  }

  async startFlying() {
    if (!this.currentRound) throw new Error('No active round');
    this.currentRound.status = RoundStatus.FLYING;
    this.flyingStartedAt = Date.now();
    await crushRepo.updateRoundInDb(this.currentRound.roundId, RoundStatus.FLYING);
    logger.info('Crush rocket launched', { roundId: this.currentRound.roundId });
    return this.currentRound;
  }

  async crashRound() {
    if (!this.currentRound) throw new Error('No active round');
    this.currentRound.status = RoundStatus.CRASHED;
    this.currentRound.currentMultiplier = this.currentRound.crashPoint;
    await crushRepo.updateRoundInDb(this.currentRound.roundId, RoundStatus.CRASHED);
    await crushRepo.settleCrashedRoundInDb(this.currentRound.roundId);
    this.currentRound.status = RoundStatus.SETTLED;
    this.currentRound.endedAt = new Date().toISOString();
    logger.info('Crush rocket crashed & settled', { roundId: this.currentRound.roundId });
    return this.currentRound;
  }

  async recoverFromDb() {
    const rounds = await crushRepo.getInFlightRoundsFromDb();
    let settled = 0;
    let refunded = 0;
    const failures = [];
    for (const round of rounds) {
      try {
        if (round.status === 'CRASHED') {
          await crushRepo.settleCrashedRoundInDb(round.id); settled += 1;
        } else if (['CREATED', 'BETTING_OPEN', 'BETTING_CLOSED', 'FLYING', 'SETTLING'].includes(round.status)) {
          await crushRepo.refundRoundInDb(round.id, 'SERVER_RESTART_RECOVERY'); refunded += 1;
        }
      } catch (err) {
        failures.push({ roundId: round.id, status: round.status, error: err.message || String(err) });
        logger.error('Crush recovery failed for round', { roundId: round.id, status: round.status, error: err.message });
      }
    }
    if (rounds.length) logger.warn('Crush recovery processed orphaned rounds', { total: rounds.length, settled, refunded, failures: failures.length });
    if (failures.length) {
      const error = new Error(`Crush recovery incomplete: ${failures.length} round(s) could not be recovered`);
      error.code = 'GAME_RECOVERY_INCOMPLETE';
      error.failures = failures;
      throw error;
    }
    return { total: rounds.length, settled, refunded };
  }
}

const crushEngine = new CrushEngine();
module.exports = { CrushEngine, crushEngine, RoundStatus };