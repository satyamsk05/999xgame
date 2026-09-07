import { socketClient } from './SocketClient.js';
import { eventBus } from '../core/EventBus.js';
import { gameState } from '../game/GameState.js';

class GameSocket {
  init() {
    socketClient.connect();
    socketClient.on('ROUND_CREATED', (data) => {
      eventBus.emit('ROUND_CREATED', data);
    });
    socketClient.on('BETTING_CLOSED', (data) => {
      eventBus.emit('BETTING_CLOSED', data);
    });
    socketClient.on('ROUND_RESULT', (data) => {
      eventBus.emit('ROUND_RESULT', data);
    });
    socketClient.on('WALLET_UPDATED', (data) => {
      if (data && data.totalBalance !== undefined) {
        gameState.setBalance(data.totalBalance);
      }
      eventBus.emit('WALLET_UPDATED', data);
    });
    socketClient.on('BET_SETTLED', (data) => {
      eventBus.emit('BET_SETTLED', data);
    });
  }
}

export const gameSocket = new GameSocket();
