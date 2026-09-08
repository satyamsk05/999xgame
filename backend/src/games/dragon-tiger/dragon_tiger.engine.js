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

/**
 * Dragon Tiger engine — SERVER-AUTHORITATIVE + provably fair (sec 23).
 *
 * Cards are derived deterministically from ONE committed server seed and the round id,
 * so a recovered round can never produce a different result. Payout/tie rules live in
 * game.config (via the repository). Settlement is a single atomic DB call. There is no
 * in-memory round counter (round_number is DB-derived) and no fallback seed.
 */
class DragonTigerEngine {
  constructor() {
    this.currentRound = null;
  }

  /** Single authoritative result derivation (deterministic from seed + roundId). */
  deriveResult(serverSeed, roundId) {
    if (!serverSeed) {
      throw new Error('Cannot draw cards: server seed is missing');
    }
    const hash = crypto.createHmac('sha256', serverSeed).update(roundId).digest('hex');
    const dCardIdx = parseInt(hash.substring(0, 8), 16) % 13;
    const dSuitIdx = parseInt(hash.substring(8, 16), 16) % 4;
    const tCardIdx = parseInt(hash.substring(16, 24), 16) % 13;
    const tSuitIdx = parseInt(hash.substring(24, 32), 16) % 4;

    const dragonCard = { ...CARDS[dCardIdx], suit: SUITS[dSuitIdx] };
    const tigerCard = { ...CARDS[tCardIdx], suit: SUITS[tSuitIdx] };

    let winningBetType = BetTypes.TIE;
    if (dragonCard.value > tigerCard.value) winningBetType = BetTypes.DRAGON;
    else if (tigerCard.value > dragonCard.value) winningBetType = BetTypes.TIGER;

    return { dragonCard, tigerCard, winningBetType };
  }

  /**
   * Startup recovery (sec 22/23). Resolves orphaned rounds deterministically:
   *  - RESULT/SETTLING (winner persisted) -> settle.
   *  - pre-result WITH committed seed -> draw + settle.
   *  - pre-result WITHOUT seed (legacy) -> void + refund.
   */
  async recoverFromDb() {
    const rounds = await dtRepo.getInFlightRoundsFromDb();
    let settled = 0;
    let drawn = 0;
    let refunded = 0;

    for (const r of rounds) {
      try {
        if (['RESULT', 'SETTLING'].includes(r.status) && r.winningBetType) {
          await dtRepo.settleRoundInDb(r.roundId, r.winningBetType);
          settled += 1;
        } else if (['CREATED', 'BETTING_OPEN', 'BETTING_CLOSED'].includes(r.status)) {
          if (r.serverSeed) {
            const { dragonCard, tigerCard, winningBetType } = this.deriveResult(r.serverSeed, r.roundId);
            await dtRepo.updateRoundInDb(r.roundId, RoundStatus.RESULT, dragonCard, tigerCard, winningBetType);
            await dtRepo.settleRoundInDb(r.roundId, winningBetType);
            drawn += 1;
          } else {
            await dtRepo.refundRoundInDb(r.roundId, 'SERVER_RESTART_NO_SEED');
            refunded += 1;
          }
        }
      } catch (err) {
        logger.error('Dragon Tiger recovery failed for round', { roundId: r.roundId, status: r.status, error: err.message });
      }
    }

    if (rounds.length) {
      logger.warn('Dragon Tiger recovery processed orphaned rounds', { total: rounds.length, settled, drawn, refunded });
    }
    return { total: rounds.length, settled, drawn, refunded };
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

    // Fail-closed: persist (with seed hash + DB-derived round_number) before use.
    await dtRepo.createRoundInDb(roundId, serverSeed, serverSeedHash);
    this.currentRound = newRound;

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
      const e = new Error('Betting is closed for Dragon Tiger');
      e.statusCode = 409;
      throw e;
    }
    if (!Object.values(BetTypes).includes(betType)) {
      const e = new Error(`Invalid bet type: ${betType}`);
      e.statusCode = 400;
      throw e;
    }
    // Deterministic idempotency (sec 23): prefer the client key; otherwise derive a
    // stable key so a retry never double-debits.
    const key = idempotencyKey || `dt_${userId}_${this.currentRound.roundId}_${betType}_${parseInt(stakePaise, 10)}`;
    return await dtRepo.placeBetInDb({
      userId,
      roundId: this.currentRound.roundId,
      betType,
      stakePaise,
      idempotencyKey: key,
    });
  }

  async drawCardsAndReveal() {
    if (!this.currentRound) throw new Error('No active round');
    if (!this.currentRound.serverSeed) {
      throw new Error('Cannot draw cards: authoritative server seed is missing');
    }

    this.currentRound.status = RoundStatus.BETTING_CLOSED;
    const { dragonCard, tigerCard, winningBetType } = this.deriveResult(
      this.currentRound.serverSeed,
      this.currentRound.roundId
    );

    this.currentRound.status = RoundStatus.RESULT;
    this.currentRound.dragonCard = dragonCard;
    this.currentRound.tigerCard = tigerCard;
    this.currentRound.winningBetType = winningBetType;

    await dtRepo.updateRoundInDb(this.currentRound.roundId, RoundStatus.RESULT, dragonCard, tigerCard, winningBetType);
    logger.info('Dragon Tiger cards drawn', { roundId: this.currentRound.roundId, winningBetType });
    return this.currentRound;
  }

  // Settle atomically (sec 23): the repository marks the round SETTLED in-transaction,
  // so there is no separate, non-atomic status update.
  async settleRound() {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.RESULT) {
      throw new Error('Cannot settle: result not generated');
    }
    this.currentRound.status = RoundStatus.SETTLING;
    try {
      const { settlements } = await dtRepo.settleRoundInDb(this.currentRound.roundId, this.currentRound.winningBetType);
      this.currentRound.status = RoundStatus.SETTLED;
      this.currentRound.endedAt = new Date().toISOString();
      logger.info('Dragon Tiger round settled', { roundId: this.currentRound.roundId, winningBetType: this.currentRound.winningBetType });
      return { round: this.currentRound, settlements };
    } catch (err) {
      this.currentRound.status = 'SETTLEMENT_FAILED';
      logger.error('Dragon Tiger settlement failed in DB', { roundId: this.currentRound.roundId, error: err.message });
      throw err; // never report a failed settlement as success
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

const dragonTigerEngine = new DragonTigerEngine();

module.exports = {
  DragonTigerEngine,
  dragonTigerEngine,
  RoundStatus,
  BetTypes,
};
