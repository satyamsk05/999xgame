const crypto = require('crypto');
const logger = require('../../utils/logger');
const crushRepo = require('./crush.repository');
const {
  CRUSH_CURVE_RATE,
  CRUSH_MAX_MULTIPLIER,
  CRUSH_MIN_AUTO_CASHOUT,
  DEFAULT_STAKE_LIMITS_PAISE,
} = require('../game.config');

const RoundStatus = {
  CREATED: 'CREATED',
  BETTING_OPEN: 'BETTING_OPEN',
  BETTING_CLOSED: 'BETTING_CLOSED',
  FLYING: 'FLYING',
  CRASHED: 'CRASHED',
  SETTLED: 'SETTLED',
};

/**
 * Crush engine — SERVER-AUTHORITATIVE (sec 24, 25, 26).
 *
 * The engine owns the round lifecycle and, crucially, the authoritative multiplier
 * clock. The client NEVER decides the payout: cashout uses the server-computed
 * multiplier derived from `flyingStartedAt`. The crash point is committed (hashed)
 * before betting opens and revealed at crash, so results are provably fair and a
 * recovered round can never be re-rolled to a different result.
 */
class CrushEngine {
  constructor() {
    this.currentRound = null;
    this.flyingStartedAt = null; // authoritative start of the multiplier curve
  }

  /**
   * Deterministic, provably-fair crash point from (serverSeed, roundId).
   * ~1/33 of rounds instant-crash at 1.00x (house edge); otherwise 1.00..MAX.
   */
  deriveCrashPoint(serverSeed, roundId) {
    const hash = crypto.createHmac('sha256', serverSeed).update(roundId).digest('hex');
    const hInt = parseInt(hash.substring(0, 8), 16);
    let crashPoint = 1.0;
    if (hInt % 33 !== 0) {
      const raw = (100 * 100) / ((hInt % 100) + 1);
      crashPoint = Math.max(1.0, Math.min(CRUSH_MAX_MULTIPLIER, parseFloat((raw / 100).toFixed(2))));
    }
    return crashPoint;
  }

  async createRound() {
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    const roundId = `crush_r_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
    const crashPoint = this.deriveCrashPoint(serverSeed, roundId);

    const now = Date.now();
    const newRound = {
      roundId,
      gameId: 'crush',
      status: RoundStatus.CREATED,
      serverSeedHash,
      serverSeed,
      crashPoint,
      currentMultiplier: 1.0,
      createdAt: new Date(now).toISOString(),
      bettingClosesAt: new Date(now + 10000).toISOString(),
      endedAt: null,
    };

    // Fail-closed: persist the round (seed hash + crash point) BEFORE it exists in
    // memory. If the DB write fails there is no round and the caller throws.
    await crushRepo.createRoundInDb(roundId, serverSeed, serverSeedHash, crashPoint);
    this.currentRound = newRound;
    this.flyingStartedAt = null;

    logger.info('Crush round created', { roundId, crashPoint });
    return this.currentRound;
  }

  async openBetting() {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.CREATED) {
      await this.createRound();
    }
    this.currentRound.status = RoundStatus.BETTING_OPEN;
    await crushRepo.updateRoundInDb(this.currentRound.roundId, RoundStatus.BETTING_OPEN);
    logger.info('Crush betting opened', { roundId: this.currentRound.roundId });
    return this.currentRound;
  }

  async placeBet({ userId, stakePaise, autoCashoutMultiplier, idempotencyKey }) {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.BETTING_OPEN) {
      const e = new Error('Betting is closed for current Crush round');
      e.statusCode = 409;
      throw e;
    }

    // Validate the OPTIONAL auto-cashout target (sec 26). NULL = manual cashout only.
    let autoTarget = null;
    if (autoCashoutMultiplier !== undefined && autoCashoutMultiplier !== null && autoCashoutMultiplier !== '') {
      autoTarget = parseFloat(autoCashoutMultiplier);
      if (!Number.isFinite(autoTarget) || autoTarget < CRUSH_MIN_AUTO_CASHOUT) {
        const e = new Error(`Auto-cashout multiplier must be at least ${CRUSH_MIN_AUTO_CASHOUT}`);
        e.statusCode = 400;
        throw e;
      }
      if (autoTarget > CRUSH_MAX_MULTIPLIER) autoTarget = CRUSH_MAX_MULTIPLIER;
    }

    // DB-controlled min/max stake (sec 21.7).
    const stakeLimits = await crushRepo.getStakeLimits('crush', DEFAULT_STAKE_LIMITS_PAISE);

    return await crushRepo.placeBetInDb({
      userId,
      roundId: this.currentRound.roundId,
      stakePaise,
      autoCashoutMultiplier: autoTarget,
      idempotencyKey,
      stakeLimits,
    });
  }

  /** Authoritative multiplier for a given elapsed flight time (ms). */
  computeMultiplier(elapsedMs) {
    if (!this.currentRound) return 1.0;
    const elapsedSec = Math.max(0, elapsedMs) / 1000;
    const raw = Math.exp(CRUSH_CURVE_RATE * elapsedSec);
    return parseFloat(Math.min(this.currentRound.crashPoint, raw).toFixed(2));
  }

  /** Current server multiplier — the SINGLE source of truth for cashout/ticks. */
  getCurrentMultiplier() {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.FLYING || !this.flyingStartedAt) {
      return 1.0;
    }
    return this.computeMultiplier(Date.now() - this.flyingStartedAt);
  }

  /** True once the flight clock has reached/passed the committed crash point. */
  isCrashed() {
    if (!this.currentRound || !this.flyingStartedAt) return false;
    const elapsedSec = (Date.now() - this.flyingStartedAt) / 1000;
    return Math.exp(CRUSH_CURVE_RATE * elapsedSec) >= this.currentRound.crashPoint;
  }

  /**
   * Server-authoritative cashout (sec 25). The client's multiplier is IGNORED as
   * truth — the server computes it from the authoritative flight clock and rejects
   * if the crash point has been reached. All money checks happen atomically in the
   * repository (bet owner, ACCEPTED, round FLYING, crash not crossed, idempotent).
   */
  async cashoutBet({ betId, userId }) {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.FLYING) {
      const e = new Error('Cashout is only available while rocket is flying');
      e.statusCode = 409;
      throw e;
    }
    const serverMultiplier = this.getCurrentMultiplier();
    if (serverMultiplier >= this.currentRound.crashPoint) {
      const e = new Error('Rocket crashed before cashout');
      e.statusCode = 409;
      throw e;
    }
    return await crushRepo.cashoutBetInDb({
      betId,
      userId,
      roundId: this.currentRound.roundId,
      cashoutMultiplier: serverMultiplier,
    });
  }

  /**
   * Enforce stored auto-cashout targets server-side (sec 26). Safe to call on every
   * tick; the repository is atomic + idempotent, so a target is honored exactly once.
   */
  async processAutoCashouts() {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.FLYING) return [];
    const serverMultiplier = this.getCurrentMultiplier();
    return await crushRepo.processAutoCashoutsInDb(this.currentRound.roundId, serverMultiplier);
  }

  async startFlying() {
    if (!this.currentRound) throw new Error('No active round');
    this.currentRound.status = RoundStatus.FLYING;
    this.flyingStartedAt = Date.now(); // authoritative multiplier clock starts here
    await crushRepo.updateRoundInDb(this.currentRound.roundId, RoundStatus.FLYING);
    logger.info('Crush rocket launched', { roundId: this.currentRound.roundId, crashPoint: this.currentRound.crashPoint });
    return this.currentRound;
  }

  async crashRound() {
    if (!this.currentRound) throw new Error('No active round');
    this.currentRound.status = RoundStatus.CRASHED;
    this.currentRound.currentMultiplier = this.currentRound.crashPoint;
    await crushRepo.updateRoundInDb(this.currentRound.roundId, RoundStatus.CRASHED);
    // sec 24: settleCrashedRoundInDb RETHROWS on failure. We must not swallow it —
    // a failed settlement propagates so the round is never reported as settled.
    await crushRepo.settleCrashedRoundInDb(this.currentRound.roundId);
    logger.info('Crush rocket crashed & settled', {
      roundId: this.currentRound.roundId,
      crashPoint: this.currentRound.crashPoint,
    });
    return this.currentRound;
  }

  /**
   * Startup recovery (sec 22/24). Rounds orphaned by a previous process are handled
   * deterministically:
   *  - CRASHED (crash point known, settlement failed before restart) -> settle now.
   *  - CREATED/BETTING_OPEN/BETTING_CLOSED/FLYING/SETTLING -> the authoritative flight
   *    clock is lost, so the round can no longer be played fairly: void + refund stakes.
   */
  async recoverFromDb() {
    const rounds = await crushRepo.getInFlightRoundsFromDb();
    let settled = 0;
    let refunded = 0;
    for (const round of rounds) {
      try {
        if (round.status === 'CRASHED') {
          await crushRepo.settleCrashedRoundInDb(round.id);
          settled += 1;
        } else if (['CREATED', 'BETTING_OPEN', 'BETTING_CLOSED', 'FLYING', 'SETTLING'].includes(round.status)) {
          await crushRepo.refundRoundInDb(round.id, 'SERVER_RESTART_RECOVERY');
          refunded += 1;
        }
      } catch (err) {
        logger.error('Crush recovery failed for round', { roundId: round.id, status: round.status, error: err.message });
      }
    }
    if (rounds.length) {
      logger.warn('Crush recovery processed orphaned rounds', { total: rounds.length, settled, refunded });
    }
    return { total: rounds.length, settled, refunded };
  }
}

const crushEngine = new CrushEngine();

module.exports = {
  CrushEngine,
  crushEngine,
  RoundStatus,
};
