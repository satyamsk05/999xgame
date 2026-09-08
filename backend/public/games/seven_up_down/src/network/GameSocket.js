import { socketClient } from './SocketClient.js';
import { eventBus } from '../core/EventBus.js';
import { gameState } from '../game/GameState.js';

class GameSocket {
  init() {
    socketClient.connect();

    // Canonical + Legacy Event mappings
    const handleRoundOpen = (data) => {
      const payload = data.payload || data;
      eventBus.emit('ROUND_CREATED', payload);
      eventBus.emit('GAME_ROUND_OPEN', payload);
    };

    const handleBettingClosed = (data) => {
      const payload = data.payload || data;
      eventBus.emit('BETTING_CLOSED', payload);
      eventBus.emit('GAME_BETTING_CLOSED', payload);
    };

    const handleRoundResult = (data) => {
      const payload = data.payload || data;
      eventBus.emit('ROUND_RESULT', payload);
      eventBus.emit('GAME_RESULT', payload);
    };

    const handleWalletUpdated = (data) => {
      const payload = data.payload || data;
      if (payload && payload.totalBalance !== undefined) {
        gameState.setBalance(payload.totalBalance);
      }
      eventBus.emit('WALLET_UPDATED', payload);
      eventBus.emit('GAME_WALLET_UPDATED', payload);
    };

    const handleBetSettled = (data) => {
      const payload = data.payload || data;
      eventBus.emit('BET_SETTLED', payload);
      eventBus.emit('GAME_ROUND_SETTLED', payload);
    };

    socketClient.on('GAME_ROUND_OPEN', handleRoundOpen);
    socketClient.on('GAME_ROUND_CREATED', handleRoundOpen);
    socketClient.on('ROUND_CREATED', handleRoundOpen);
    socketClient.on('7ud:round_open', handleRoundOpen);

    socketClient.on('GAME_BETTING_CLOSED', handleBettingClosed);
    socketClient.on('BETTING_CLOSED', handleBettingClosed);

    socketClient.on('GAME_RESULT', handleRoundResult);
    socketClient.on('ROUND_RESULT', handleRoundResult);
    socketClient.on('7ud:dice_rolled', handleRoundResult);

    socketClient.on('GAME_ROUND_SETTLED', handleBetSettled);
    socketClient.on('BET_SETTLED', handleBetSettled);
    socketClient.on('7ud:round_settled', handleBetSettled);

    socketClient.on('GAME_WALLET_UPDATED', handleWalletUpdated);
    socketClient.on('WALLET_UPDATED', handleWalletUpdated);

    socketClient.on('RESYNC_STATE', (stateData) => {
      if (stateData && stateData.currentRound) {
        handleRoundOpen(stateData.currentRound);
      }
    });
  }
}

export const gameSocket = new GameSocket();
