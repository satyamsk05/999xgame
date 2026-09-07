// Main Entry Point Forwarder for InGames / 999x Game Backend Server
if (typeof global.EventSource === 'undefined') {
  const esModule = require('eventsource');
  global.EventSource = esModule.EventSource || esModule.default || esModule;
}

require('./src/server/http');
