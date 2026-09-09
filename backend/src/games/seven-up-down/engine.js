const crypto = require('crypto');
const logger = require('../../utils/logger');
const gameRepo = require('./game.repository');
const { SEVEN_UP_DOWN_PAYOUTS } = require('../game.config');

const RoundStatus = {
  CREATED: 'CREATED',
  BETTING_OPEN: 'BETTING_OPEN',
  BETTING_CLOSED: 'BETTING_CLOSED',
  ROLLING: 'ROLLING',
  RESULT: 'RESULT',
  SETTLING: 'SETTLING',
  SETTLED: 'SETTLED',
};

const BetTypes = { DOWN: 'DOWN', SEVEN: 'SEVEN', UP: 'UP' };
const PayoutMultipliers = { ...SEVEN_UP_DOWN_PAYOUTS };

class SevenUpDownEngine {
  constructor() { this.currentRound = null; }

  deriveResult(serverSeed, roundId) {
    if (!serverSeed) throw new Error('Cannot derive result: server seed is missing');
    const hash = crypto.createHmac('sha256', serverSeed).update(roundId).digest('hex');
    const val1 = parseInt(hash.substring(0, 8), 16);
    const val2 = parseInt(hash.substring(8, 16), 16);
    const dice1 = (val1 % 6) + 1;
    const dice2 = (val2 % 6) + 1;
    const diceSum = dice1 + dice2;
    let winningBetType = BetTypes.SEVEN;
    if (diceSum < 7) winningBetType = BetTypes.DOWN;
    else if (diceSum > 7) winningBetType = BetTypes.UP;
    return { dice1, dice2, diceSum, winningBetType };
  }

  _attachPublicSerialization(round) {
    if (!round || typeof round !== 'object') return round;
    Object.defineProperty(round, 'toJSON', {
      enumerable: false,
      configurable: true,
      value: function () {
        const safe = { ...this };
        if (this.status !== RoundStatus.SETTLED) delete safe.serverSeed;
        return safe;
      },
    });
    return round;
  }

  async recoverFromDb() {
    const rounds = await gameRepo.getInFlightRoundsFromDb();
    let settled = 0;
    let rolled = 0;
    let refunded = 0;
    const failures = [];
    for (const r of rounds) {
      try {
        if (['RESULT', 'SETTLING'].includes(r.status) && r.winningBetType) {
          await gameRepo.settleRoundInDb(r.roundId, r.winningBetType); settled += 1;
        } else if (['CREATED', 'BETTING_OPEN', 'BETTING_CLOSED', 'ROLLING'].includes(r.status)) {
          if (r.serverSeed) {
            const { dice1, dice2, diceSum, winningBetType } = this.deriveResult(r.serverSeed, r.roundId);
            await gameRepo.updateRoundInDb(r.roundId, RoundStatus.RESULT, dice1, dice2, diceSum, winningBetType);
            await gameRepo.settleRoundInDb(r.roundId, winningBetType); rolled += 1;
          } else {
            await gameRepo.refundRoundInDb(r.roundId, 'SERVER_RESTART_NO_SEED'); refunded += 1;
          }
        }
      } catch (err) {
        failures.push({ roundId: r.roundId, status: r.status, error: err.message || String(err) });
        logger.error('7 Up Down recovery failed for round', { roundId: r.roundId, status: r.status, error: err.message });
      }
    }
    if (rounds.length) logger.warn('7 Up Down recovery processed orphaned rounds', { total: rounds.length, settled, rolled, refunded, failures: failures.length });
    if (failures.length) {
      const error = new Error(`7 Up Down recovery incomplete: ${failures.length} round(s) could not be recovered`);
      error.code = 'GAME_RECOVERY_INCOMPLETE';
      error.failures = failures;
      throw error;
    }
    return { total: rounds.length, settled, rolled, refunded };
  }

  async recoverActiveRoundFromDb() {
    try {
      const active = await gameRepo.getRecentRoundsFromDb(1);
      if (active && active.length > 0) {
        const last = active[0];
        if (['CREATED', 'BETTING_OPEN', 'BETTING_CLOSED', 'RESULT', 'SETTLING'].includes(last.status)) {
          this.currentRound = this._attachPublicSerialization({
            roundId: last.roundId,
            gameId: 'seven_up_down',
            status: last.status,
            serverSeedHash: last.serverSeedHash || '',
            serverSeed: last.serverSeed || '',
            dice1: last.dice1,
            dice2: last.dice2,
            diceSum: last.diceSum,
            winningBetType: last.winningBetType,
            createdAt: last.createdAt,
            bettingClosedAt: null,
            endedAt: last.endedAt,
          });
          logger.info('Recovered active 7 Up Down round from DB', { roundId: last.roundId, status: last.status });
          return this.currentRound;
        }
      }
    } catch (err) { logger.error('Error recovering active round from DB', { error: err.message }); }
    return null;
  }

  async createRound() {
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    const roundId = `7ud_r_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
    const newRound = { roundId, gameId: 'seven_up_down', status: RoundStatus.CREATED, serverSeedHash, serverSeed, dice1: null, dice2: null, diceSum: null, winningBetType: null, createdAt: new Date().toISOString(), bettingClosedAt: null, endedAt: null };
    await gameRepo.createRoundInDb(roundId, serverSeed, serverSeedHash);
    this.currentRound = this._attachPublicSerialization(newRound);
    logger.info('New 7 Up Down round created', { roundId, status: this.currentRound.status });
    return this.currentRound;
  }

  async openBetting() {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.CREATED) {
      if (this.currentRound && this.currentRound.status === RoundStatus.BETTING_OPEN) return this.currentRound;
      await this.createRound();
    }
    this.currentRound.status = RoundStatus.BETTING_OPEN;
    await gameRepo.updateRoundInDb(this.currentRound.roundId, RoundStatus.BETTING_OPEN);
    logger.info('7 Up Down betting window opened', { roundId: this.currentRound.roundId });
    return this.currentRound;
  }

  async placeBet({ userId, betType, stakePaise, idempotencyKey }) {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.BETTING_OPEN) { const e = new Error('Betting is closed for current round'); e.statusCode = 409; throw e; }
    if (!Object.values(BetTypes).includes(betType)) { const e = new Error(`Invalid bet type: ${betType}. Must be DOWN, SEVEN, or UP`); e.statusCode = 400; throw e; }
    return gameRepo.placeBetInDb({ userId, roundId: this.currentRound.roundId, betType, stakePaise, idempotencyKey });
  }

  async closeBettingAndRoll() {
    if (!this.currentRound || (this.currentRound.status !== RoundStatus.BETTING_OPEN && this.currentRound.status !== RoundStatus.CREATED)) throw new Error('Cannot roll: round is not in BETTING_OPEN state');
    if (!this.currentRound.serverSeed) throw new Error('Cannot roll: authoritative server seed is missing');
    this.currentRound.status = RoundStatus.BETTING_CLOSED;
    this.currentRound.bettingClosedAt = new Date().toISOString();
    const { dice1, dice2, diceSum, winningBetType } = this.deriveResult(this.currentRound.serverSeed, this.currentRound.roundId);
    this.currentRound.status = RoundStatus.RESULT;
    this.currentRound.dice1 = dice1; this.currentRound.dice2 = dice2; this.currentRound.diceSum = diceSum; this.currentRound.winningBetType = winningBetType;
    await gameRepo.updateRoundInDb(this.currentRound.roundId, RoundStatus.RESULT, dice1, dice2, diceSum, winningBetType);
    logger.info('7 Up Down dice roll complete', { roundId: this.currentRound.roundId, dice1, dice2, diceSum, winningBetType });
    return this.currentRound;
  }

  async settleRound() {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.RESULT) throw new Error('Cannot settle: result not generated');
    this.currentRound.status = RoundStatus.SETTLING;
    try {
      const settlements = await gameRepo.settleRoundInDb(this.currentRound.roundId, this.currentRound.winningBetType);
      this.currentRound.status = RoundStatus.SETTLED;
      this.currentRound.endedAt = new Date().toISOString();
      logger.info('7 Up Down round settled', { roundId: this.currentRound.roundId, winningType: this.currentRound.winningBetType });
      return { round: this.currentRound, settlements };
    } catch (err) {
      this.currentRound.status = 'SETTLEMENT_FAILED';
      logger.error('Round settlement failed in DB', { roundId: this.currentRound.roundId, error: err.message });
      throw err;
    }
  }

  async getOrStartCurrentRound() {
    if (!this.currentRound || this.currentRound.status === RoundStatus.SETTLED || this.currentRound.status === 'SETTLEMENT_FAILED') {
      await this.createRound();
      await this.openBetting();
    }
    return this.currentRound;
  }
}

const sevenUpDownEngine = new SevenUpDownEngine();
module.exports = { SevenUpDownEngine, sevenUpDownEngine, RoundStatus, BetTypes, PayoutMultipliers };