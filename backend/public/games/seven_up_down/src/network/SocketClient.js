class SocketClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.listeners = new Map(); // eventName -> Array<callback>
    this.isConnecting = false;
  }

  connect() {
    if (typeof window === 'undefined') return;
    if (this.socket && (this.connected || this.isConnecting)) return;

    this.isConnecting = true;

    const tryConnect = () => {
      if (window.io) {
        let token = null;
        try {
          const urlParams = new URLSearchParams(window.location.search);
          token = urlParams.get('token') || window.IN_GAMES_AUTH_TOKEN || localStorage.getItem('ingames_token');
        } catch (_) {
          token = window.IN_GAMES_AUTH_TOKEN || null;
        }

        const serverUrl = (window.IN_GAMES_SERVER_URL || '').replace(/\/$/, '');

        this.socket = window.io(serverUrl || undefined, {
          auth: token ? { token } : {},
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
        });

        this.socket.on('connect', () => {
          this.connected = true;
          this.isConnecting = false;
          console.log('[7 Up Down Socket Connected]');
          this.resyncState();
        });

        this.socket.on('disconnect', () => {
          this.connected = false;
          this.isConnecting = false;
          console.log('[7 Up Down Socket Disconnected]');
        });

        // Attach listeners cleanly without duplicates
        this.listeners.forEach((callbacks, event) => {
          callbacks.forEach((cb) => {
            this.socket.off(event, cb);
            this.socket.on(event, cb);
          });
        });
      } else {
        setTimeout(tryConnect, 300);
      }
    };

    tryConnect();
  }

  async resyncState() {
    try {
      const res = await fetch('/api/games/seven_up_down/current-state');
      if (res.ok) {
        const body = await res.json();
        if (body.status === 'success' && body.data) {
          const callbacks = this.listeners.get('RESYNC_STATE') || [];
          callbacks.forEach((cb) => cb(body.data));
        }
      }
    } catch (err) {
      console.warn('State resync failed', err);
    }
  }

  emit(event, data) {
    if (this.socket && this.connected) {
      this.socket.emit(event, data);
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    const cbs = this.listeners.get(event);
    if (!cbs.includes(callback)) {
      cbs.push(callback);
    }
    if (this.socket) {
      this.socket.off(event, callback);
      this.socket.on(event, callback);
    }
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      if (callback) {
        const cbs = this.listeners.get(event).filter((cb) => cb !== callback);
        this.listeners.set(event, cbs);
      } else {
        this.listeners.delete(event);
      }
    }
    if (this.socket) {
      if (callback) {
        this.socket.off(event, callback);
      } else {
        this.socket.off(event);
      }
    }
  }
}

export const socketClient = new SocketClient();
