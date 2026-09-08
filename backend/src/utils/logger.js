const config = require('../config/env');

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevelPriority = levels[config.logLevel] ?? levels.info;

// ANSI Colors for live terminal rendering
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[92m',
  yellow: '\x1b[93m',
  magenta: '\x1b[95m',
  red: '\x1b[91m',
  blue: '\x1b[94m',
  bgMagenta: '\x1b[45m\x1b[37m',
  bgBlue: '\x1b[44m\x1b[37m',
  bgGreen: '\x1b[42m\x1b[30m',
};

function formatPretty(level, message, meta) {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });

  // 1. 7 Up Down Game Roll & Settlement
  if (message.includes('7 Up Down dice roll complete') || message.includes('7 Up Down round settled')) {
    const d1 = meta.dice1 ?? '-';
    const d2 = meta.dice2 ?? '-';
    const sum = meta.diceSum ?? '-';
    const result = meta.winningBetType || meta.winningType || 'SETTLED';
    const roundId = meta.roundId || 'N/A';

    console.log(
      `\n${C.bgMagenta}${C.bold} 🎲 7 UP DOWN ${C.reset} ${C.magenta}${C.bold}│ Round: ${roundId}${C.reset}\n` +
      `┌──────────────────────────────────────────────────────────┐\n` +
      `│  ${C.bold}Dice:${C.reset} [ ${C.yellow}${C.bold}${d1}${C.reset} ] + [ ${C.yellow}${C.bold}${d2}${C.reset} ] = ${C.cyan}${C.bold}${sum}${C.reset}  │  ${C.bold}Result:${C.reset} ${C.green}${C.bold}${result}${C.reset}  │\n` +
      `└──────────────────────────────────────────────────────────┘`
    );
    return;
  }

  // 2. Dragon Vs Tiger Card Game
  if (message.includes('Dragon Tiger cards drawn')) {
    const dc = meta.dragonCard ? `${meta.dragonCard.rank}${meta.dragonCard.suit}` : '-';
    const tc = meta.tigerCard ? `${meta.tigerCard.rank}${meta.tigerCard.suit}` : '-';
    const winner = meta.winningBetType || 'N/A';
    const roundId = meta.roundId || 'N/A';

    console.log(
      `\n${C.bgBlue}${C.bold} 🐉🐅 DRAGON VS TIGER ${C.reset} ${C.blue}${C.bold}│ Round: ${roundId}${C.reset}\n` +
      `┌──────────────────────────────────────────────────────────┐\n` +
      `│  🐉 ${C.bold}Dragon:${C.reset} ${C.red}${C.bold}${dc}${C.reset}   vs   🐅 ${C.bold}Tiger:${C.reset} ${C.yellow}${C.bold}${tc}${C.reset}  │  🏆 ${C.green}${C.bold}${winner}${C.reset}  │\n` +
      `└──────────────────────────────────────────────────────────┘`
    );
    return;
  }

  // 3. Crush Rocket Game
  if (message.includes('Crush rocket crashed') || message.includes('Crush rocket launched')) {
    const isCrash = message.includes('crashed');
    const point = meta.crashPoint ? `${meta.crashPoint}x` : 'LAUNCHING';
    const roundId = meta.roundId || 'N/A';
    const color = isCrash ? C.red : C.green;
    const icon = isCrash ? '💥 CRASHED AT' : '🚀 LAUNCHED';

    console.log(
      `\n${C.bgGreen}${C.bold} 🚀 CRUSH GAME ${C.reset} ${C.green}${C.bold}│ Round: ${roundId}${C.reset}\n` +
      `┌──────────────────────────────────────────────────────────┐\n` +
      `│  ${icon}: ${color}${C.bold}${point}${C.reset}                                    │\n` +
      `└──────────────────────────────────────────────────────────┘`
    );
    return;
  }

  // 4. Socket Connections
  if (message.includes('Socket connection authenticated') || message.includes('Client connected')) {
    const user = meta.userId || 'Guest';
    const socket = meta.socketId || 'N/A';
    console.log(
      `${C.dim}[${time}]${C.reset} 🔌 ${C.green}${C.bold}CLIENT CONNECTED${C.reset} → User: ${C.cyan}${user}${C.reset} (Socket: ${socket})`
    );
    return;
  }

  // 5. Standard line logging
  let levelTag = `${C.cyan}[INFO]${C.reset}`;
  if (level === 'error') levelTag = `${C.red}${C.bold}[ERROR]${C.reset}`;
  else if (level === 'warn') levelTag = `${C.yellow}${C.bold}[WARN]${C.reset}`;
  else if (level === 'debug') levelTag = `${C.magenta}[DEBUG]${C.reset}`;

  const metaStr = Object.keys(meta).length ? ` ${C.dim}${JSON.stringify(meta)}${C.reset}` : '';
  console.log(`${C.dim}[${time}]${C.reset} ${levelTag} ${message}${metaStr}`);
}

function log(level, message, meta = {}) {
  if ((levels[level] ?? 2) <= currentLevelPriority) {
    if (process.env.LOG_FORMAT === 'json') {
      console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: level.toUpperCase(), message, ...meta }));
    } else {
      formatPretty(level, message, meta);
    }
  }
}

module.exports = {
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  debug: (msg, meta) => log('debug', msg, meta),
};
