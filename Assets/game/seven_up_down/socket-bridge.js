(function () {
  'use strict';
  // The game API base is /api, but Socket.IO lives at the HTTP root.
  // Patch the global client once it is available so WebView/mobile clients
  // connect to /socket.io instead of /api/socket.io.
  const original = () => window.io;
  const started = Date.now();
  const timer = setInterval(() => {
    const io = original();
    if (typeof io !== 'function' || io.__ingamesRootPatched) {
      if (Date.now() - started > 10000) clearInterval(timer);
      return;
    }
    function rootIo(url, opts) {
      let target = url;
      if (typeof target === 'string' && /\/api\/?$/.test(target)) target = target.replace(/\/api\/?$/, '');
      const socket = io.call(this, target, opts);
      return socket;
    }
    Object.setPrototypeOf(rootIo, io);
    rootIo.__ingamesRootPatched = true;
    rootIo.version = io.version;
    window.io = rootIo;
    clearInterval(timer);
  }, 10);

  // Forward the game's window.parent.postMessage events into Flutter's
  // JavaScript channel when running inside the native WebView.
  window.addEventListener('message', function (event) {
    const data = event && event.data;
    if (!data || data.source !== 'ingames-game' || !window.InGamesNativeBridge) return;
    try { window.InGamesNativeBridge.postMessage(JSON.stringify(data)); } catch (_) {}
  });
})();
