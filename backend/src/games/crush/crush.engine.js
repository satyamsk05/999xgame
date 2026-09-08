const crypto = require('crypto');
const logger = require('../../utils/logger');
const crushRepo = require('./crush.repository');

const RoundStatus = {
  CREATED: 'CREATED',
  BETTING_OPEN: 'BETTING_OPEN',
  FLYING: 'FLYING',
  CRASHED: 'CRASHED',
  SETTLED: 'SETTLED',
};

class CrushEngine {
  constructor() {
    this.currentRound = null;
    this.roundCounter = 1;
  }

  async createRound() {
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    const roundId = `crush_r_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;

    const hash = crypto.createHmac('sha256', serverSeed).update(roundId).digest('hex');
    const hInt = parseInt(hash.substring(0, 8), 16);
    
    let crashPoint = 1.00;
    if (hInt % 33 !== 0) {
      const raw = (100 * 100) / ((hInt % 100) + 1);
      crashPoint = Math.max(1.00, Math.min(100.00, parseFloat((raw / 100).toFixed(2))));
    }

    const now = Date.now();
    const newRound = {
      roundId,
      gameId: 'crush',
      status: RoundStatus.CREATED,
      serverSeedHash,
      serverSeed,
      crashPoint,
      currentMultiplier: 1.00,
      createdAt: new Date(now).toISOString(),
      bettingClosesAt: new Date(now + 10000).toISOString(),
      endedAt: null,
    };

    try {
      await crushRepo.createRoundInDb(roundId, this.roundCounter++, serverSeed, serverSeedHash, crashPoint);
      this.currentRound = newRound;
    } catch (err) {
      logger.error('Failed to persist Crush round in DB', { roundId, error: err.message });
      throw err;
    }

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
      throw new Error('Betting is closed for current Crush round');
    }
    return await crushRepo.placeBetInDb({
      userId,
      roundId: this.currentRound.roundId,
      stakePaise,
      autoCashoutMultiplier,
      idempotencyKey,
    });
  }

  async cashoutBet({ betId, userId, multiplier }) {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.FLYING) {
      throw new Error('Cashout is only available while rocket is flying');
    }
    if (multiplier > this.currentRound.crashPoint) {
      throw new Error('Rocket crashed before cashout');
    }
    return await crushRepo.cashoutBetInDb({
      betId,
      userId,
      roundId: this.currentRound.roundId,
      cashoutMultiplier: multiplier,
    });
  }

  async startFlying() {
    if (!this.currentRound) throw new Error('No active round');
    this.currentRound.status = RoundStatus.FLYING;
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
    logger.info('Crush rocket crashed', { roundId: this.currentRound.roundId, crashPoint: this.currentRound.crashPoint });
    return this.currentRound;
  }
}

const crushEngine = new CrushEngine();

module.exports = {
  CrushEngine,
  crushEngine,
  RoundStatus,
};
