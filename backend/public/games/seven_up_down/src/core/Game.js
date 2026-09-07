import { eventBus } from './EventBus.js';
import { soundManager } from './SoundManager.js';
import { gameConfig } from '../config/gameConfig.js';

export class Game {
  constructor() {
    this.config = gameConfig;
    this.eventBus = eventBus;
    this.soundManager = soundManager;
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    console.log(`[7 Up Down Game Core Initialized] Version: ${this.config.version}`);
  }
}
