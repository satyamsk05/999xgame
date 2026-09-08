const crypto = require('crypto');
const logger = require('../../utils/logger');
const dtRepo = require('./dragon_tiger.repository');

const RoundStatus = {
  CREATED: 'CREATED',
  BETTING_OPEN: 'BETTING_OPEN',
  BETTING_CLOSED: 'BETTING_CLOSED',
  RESULT: 'RESULT',
  SETTLING: 'SETTLING',
  SETTLED: 'SETTLED',
};

const BetTypes = {
  DRAGON: 'DRAGON',
  TIGER: 'TIGER',
  TIE: 'TIE',
};

const CARDS = [
  { rank: 'A', value: 1 },
  { rank: '2', value: 2 },
  { rank: '3', value: 3 },
  { rank: '4', value: 4 },
  { rank: '5', value: 5 },
  { rank: '6', value: 6 },
  { rank: '7', value: 7 },
  { rank: '8', value: 8 },
  { rank: '9', value: 9 },
  { rank: '10', value: 10 },
  { rank: 'J', value: 11 },
  { rank: 'Q', value: 12 },
  { rank: 'K', value: 13 },
];

const SUITS = ['♠', '♥', '♣', '♦'];

class DragonTigerEngine {
  constructor() {
    this.currentRound = null;
    this.roundCounter = 1;
  }

  async createRound() {
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    const roundId = `dt_r_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;

    const now = Date.now();
    const newRound = {
      roundId,
      gameId: 'dragon_tiger',
      status: RoundStatus.CREATED,
      serverSeedHash,
      serverSeed,
      dragonCard: null,
      tigerCard: null,
      winningBetType: null,
      createdAt: new Date(now).toISOString(),
      bettingClosesAt: new Date(now + 15000).toISOString(),
      endedAt: null,
    };

    try {
      await dtRepo.createRoundInDb(roundId, this.roundCounter++, serverSeed, serverSeedHash);
      this.currentRound = newRound;
    } catch (err) {
      logger.error('Failed to persist Dragon Tiger round in DB', { roundId, error: err.message });
      throw err;
    }

    logger.info('Dragon Tiger round created', { roundId });
    return this.currentRound;
  }

  async openBetting() {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.CREATED) {
      await this.createRound();
    }
    this.currentRound.status = RoundStatus.BETTING_OPEN;
    await dtRepo.updateRoundInDb(this.currentRound.roundId, RoundStatus.BETTING_OPEN);
    logger.info('Dragon Tiger betting opened', { roundId: this.currentRound.roundId });
    return this.currentRound;
  }

  async placeBet({ userId, betType, stakePaise, idempotencyKey }) {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.BETTING_OPEN) {
      throw new Error('Betting is closed for Dragon Tiger');
    }
    if (!Object.values(BetTypes).includes(betType)) {
      throw new Error(`Invalid bet type: ${betType}`);
    }
    return await dtRepo.placeBetInDb({ userId, roundId: this.currentRound.roundId, betType, stakePaise, idempotencyKey });
  }

  async drawCardsAndReveal() {
    if (!this.currentRound) throw new Error('No active round');

    this.currentRound.status = RoundStatus.BETTING_CLOSED;

    const hash = crypto.createHmac('sha256', this.currentRound.serverSeed)
      .update(this.currentRound.roundId)
      .digest('hex');

    const dCardIdx = parseInt(hash.substring(0, 8), 16) % 13;
    const dSuitIdx = parseInt(hash.substring(8, 16), 16) % 4;
    const tCardIdx = parseInt(hash.substring(16, 24), 16) % 13;
    const tSuitIdx = parseInt(hash.substring(24, 32), 16) % 4;

    const dragonCard = { ...CARDS[dCardIdx], suit: SUITS[dSuitIdx] };
    const tigerCard = { ...CARDS[tCardIdx], suit: SUITS[tSuitIdx] };

    let winningBetType = BetTypes.TIE;
    if (dragonCard.value > tigerCard.value) {
      winningBetType = BetTypes.DRAGON;
    } else if (tigerCard.value > dragonCard.value) {
      winningBetType = BetTypes.TIGER;
    }

    this.currentRound.status = RoundStatus.RESULT;
    this.currentRound.dragonCard = dragonCard;
    this.currentRound.tigerCard = tigerCard;
    this.currentRound.winningBetType = winningBetType;

    await dtRepo.updateRoundInDb(this.currentRound.roundId, RoundStatus.RESULT, dragonCard, tigerCard, winningBetType);
    logger.info('Dragon Tiger cards drawn', { roundId: this.currentRound.roundId, dragonCard, tigerCard, winningBetType });
    return this.currentRound;
  }

  async settleRound() {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.RESULT) {
      throw new Error('Cannot settle: result not generated');
    }

    this.currentRound.status = RoundStatus.SETTLING;
    const settlements = await dtRepo.settleRoundInDb(this.currentRound.roundId, this.currentRound.winningBetType);

    this.currentRound.status = RoundStatus.SETTLED;
    this.currentRound.endedAt = new Date().toISOString();
    await dtRepo.updateRoundInDb(this.currentRound.roundId, RoundStatus.SETTLED);

    return { round: this.currentRound, settlements };
  }
}

const dragonTigerEngine = new DragonTigerEngine();

module.exports = {
  DragonTigerEngine,
  dragonTigerEngine,
  RoundStatus,
  BetTypes,
};
