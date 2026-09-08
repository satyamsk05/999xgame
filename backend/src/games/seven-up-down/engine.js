const crypto = require('crypto');
const logger = require('../../utils/logger');
const gameRepo = require('./game.repository');

const RoundStatus = {
  CREATED: 'CREATED',
  BETTING_OPEN: 'BETTING_OPEN',
  BETTING_CLOSED: 'BETTING_CLOSED',
  ROLLING: 'ROLLING',
  RESULT: 'RESULT',
  SETTLING: 'SETTLING',
  SETTLED: 'SETTLED',
};

const BetTypes = {
  DOWN: 'DOWN',       // Sum 2..6 (2.0x)
  SEVEN: 'SEVEN',     // Sum 7 (5.0x)
  UP: 'UP',           // Sum 8..12 (2.0x)
};

const PayoutMultipliers = {
  [BetTypes.DOWN]: 2.0,
  [BetTypes.SEVEN]: 5.0,
  [BetTypes.UP]: 2.0,
};

class SevenUpDownEngine {
  constructor() {
    this.currentRound = null;
    this.roundCounter = 1;
  }

  // Recover active un-settled round from PostgreSQL DB on server startup
  async recoverActiveRoundFromDb() {
    try {
      const active = await gameRepo.getRecentRoundsFromDb(1);
      if (active && active.length > 0) {
        const last = active[0];
        if (['CREATED', 'BETTING_OPEN', 'BETTING_CLOSED', 'RESULT', 'SETTLING'].includes(last.status)) {
          this.currentRound = {
            roundId: last.roundId,
            gameId: 'seven_up_down',
            status: last.status,
            serverSeedHash: '',
            serverSeed: '',
            dice1: last.dice1,
            dice2: last.dice2,
            diceSum: last.diceSum,
            winningBetType: last.winningBetType,
            createdAt: last.createdAt,
            bettingClosedAt: null,
            endedAt: last.endedAt,
          };
          logger.info('Recovered active 7 Up Down round from PostgreSQL DB', { roundId: last.roundId, status: last.status });
          return this.currentRound;
        }
      }
    } catch (err) {
      logger.error('Error recovering active round from DB', { error: err.message });
    }
    return null;
  }

  // Create New Round & Persist in PostgreSQL
  async createRound() {
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    const roundId = `7ud_r_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;

    const newRound = {
      roundId,
      gameId: 'seven_up_down',
      status: RoundStatus.CREATED,
      serverSeedHash,
      serverSeed,
      dice1: null,
      dice2: null,
      diceSum: null,
      winningBetType: null,
      createdAt: new Date().toISOString(),
      bettingClosedAt: null,
      endedAt: null,
    };

    try {
      await gameRepo.createRoundInDb(roundId, this.roundCounter++, serverSeed, serverSeedHash);
      this.currentRound = newRound;
    } catch (err) {
      logger.error('Failed to persist new round in DB', { roundId, error: err.message });
      throw err;
    }

    logger.info('New 7 Up Down round created', { roundId, status: this.currentRound.status });
    return this.currentRound;
  }

  // Open Betting Window
  async openBetting() {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.CREATED) {
      if (this.currentRound && this.currentRound.status === RoundStatus.BETTING_OPEN) {
        return this.currentRound;
      }
      await this.createRound();
    }
    this.currentRound.status = RoundStatus.BETTING_OPEN;

    try {
      await gameRepo.updateRoundInDb(this.currentRound.roundId, RoundStatus.BETTING_OPEN);
    } catch (err) {
      logger.error('Failed to update round state to BETTING_OPEN in DB', { roundId: this.currentRound.roundId, error: err.message });
      throw err;
    }

    logger.info('7 Up Down betting window opened', { roundId: this.currentRound.roundId });
    return this.currentRound;
  }

  // Place Bet with Atomic PostgreSQL Wallet Debit + DB Idempotency
  async placeBet({ userId, betType, stakePaise, idempotencyKey }) {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.BETTING_OPEN) {
      throw new Error('Betting is closed for current round');
    }

    if (!Object.values(BetTypes).includes(betType)) {
      throw new Error(`Invalid bet type: ${betType}. Must be DOWN, SEVEN, or UP`);
    }

    if (!stakePaise || stakePaise < 1000) {
      throw new Error('Minimum bet stake is ₹10 (1000 paise)');
    }

    return await gameRepo.placeBetInDb({
      userId,
      roundId: this.currentRound.roundId,
      betType,
      stakePaise,
      idempotencyKey,
    });
  }

  // Close Betting Window & Roll Dice
  async closeBettingAndRoll() {
    if (!this.currentRound || (this.currentRound.status !== RoundStatus.BETTING_OPEN && this.currentRound.status !== RoundStatus.CREATED)) {
      throw new Error('Cannot roll: round is not in BETTING_OPEN state');
    }

    this.currentRound.status = RoundStatus.BETTING_CLOSED;
    this.currentRound.bettingClosedAt = new Date().toISOString();

    const hash = crypto.createHmac('sha256', this.currentRound.serverSeed || 'seed')
      .update(this.currentRound.roundId)
      .digest('hex');
    
    const val1 = parseInt(hash.substring(0, 8), 16);
    const val2 = parseInt(hash.substring(8, 16), 16);
    
    const dice1 = (val1 % 6) + 1;
    const dice2 = (val2 % 6) + 1;
    const diceSum = dice1 + dice2;

    let winningBetType = BetTypes.SEVEN;
    if (diceSum < 7) {
      winningBetType = BetTypes.DOWN;
    } else if (diceSum > 7) {
      winningBetType = BetTypes.UP;
    }

    this.currentRound.status = RoundStatus.RESULT;
    this.currentRound.dice1 = dice1;
    this.currentRound.dice2 = dice2;
    this.currentRound.diceSum = diceSum;
    this.currentRound.winningBetType = winningBetType;

    try {
      await gameRepo.updateRoundInDb(
        this.currentRound.roundId,
        RoundStatus.RESULT,
        dice1,
        dice2,
        diceSum,
        winningBetType
      );
    } catch (err) {
      logger.error('Failed to update round result in DB', { roundId: this.currentRound.roundId, error: err.message });
      throw err;
    }

    logger.info('7 Up Down dice roll complete', {
      roundId: this.currentRound.roundId,
      dice1,
      dice2,
      diceSum,
      winningBetType,
    });

    return this.currentRound;
  }

  // Settle Round Bets
  async settleRound() {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.RESULT) {
      throw new Error('Cannot settle: result not generated');
    }

    this.currentRound.status = RoundStatus.SETTLING;
    let settlements = [];

    try {
      settlements = await gameRepo.settleRoundInDb(this.currentRound.roundId, this.currentRound.winningBetType);
      this.currentRound.status = RoundStatus.SETTLED;
      this.currentRound.endedAt = new Date().toISOString();
    } catch (err) {
      this.currentRound.status = 'SETTLEMENT_FAILED';
      logger.error('Round settlement failed in DB', { roundId: this.currentRound.roundId, error: err.message });
      throw err;
    }

    logger.info('7 Up Down round settled', {
      roundId: this.currentRound.roundId,
      winningType: this.currentRound.winningBetType,
    });

    return {
      round: this.currentRound,
      settlements,
    };
  }

  // Get current active round or initialize new one
  async getOrStartCurrentRound() {
    if (!this.currentRound || this.currentRound.status === RoundStatus.SETTLED || this.currentRound.status === 'SETTLEMENT_FAILED') {
      await this.createRound();
      await this.openBetting();
    }
    return this.currentRound;
  }
}

const sevenUpDownEngine = new SevenUpDownEngine();

module.exports = {
  SevenUpDownEngine,
  sevenUpDownEngine,
  RoundStatus,
  BetTypes,
  PayoutMultipliers,
};
