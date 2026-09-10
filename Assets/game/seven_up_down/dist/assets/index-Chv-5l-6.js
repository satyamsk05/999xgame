(function () {
  'use strict';

  const GAME = 'seven_up_down';
  const HISTORY = 100;
  const BET_MS = 15000;

  const token = (() => {
    try {
      const hashToken = new URLSearchParams(location.hash.replace(/^#/, '')).get('token');
      const queryToken = new URLSearchParams(location.search).get('token');
      if (queryToken) {
        localStorage.setItem('ingames_token', queryToken);
        return queryToken;
      }
      return hashToken || window.IN_GAMES_AUTH_TOKEN || localStorage.getItem('ingames_token');
    } catch (_) {
      return window.IN_GAMES_AUTH_TOKEN || null;
    }
  })();

  const base = (window.IN_GAMES_SERVER_URL || '').replace(/\/$/, '');
  let round = null;
  let status = 'BETTING_OPEN';
  let closeAt = 0;
  let timer = null;
  let history = [];
  let diceRollTimer = null;

  const $ = (id) => document.getElementById(id);

  const headers = () => ({
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  async function api(path, opt = {}) {
    const response = await fetch(base + path, {
      ...opt,
      headers: { ...headers(), ...(opt.headers || {}) },
    });
    let body = null;
    try { body = await response.json(); } catch (_) {}
    if (!response.ok) {
      throw new Error(body?.message || body?.error?.message || `Request failed (${response.status})`);
    }
    return body;
  }

  function txt(id, value) {
    const element = $(id);
    if (element) element.textContent = String(value);
  }

  function money(value) {
    return `₹${Number(value || 0).toFixed(2)}`;
  }

  function type(sum) {
    return sum === 7 ? 'SEVEN' : sum >= 8 ? 'UP' : 'DOWN';
  }

  function statusText(value) {
    let element = $('liveGameStatus');
    if (!element) {
      element = document.createElement('div');
      element.id = 'liveGameStatus';
      element.style.cssText = 'position:fixed;left:50%;top:76px;transform:translateX(-50%);z-index:1000;padding:6px 12px;border-radius:999px;background:rgba(20,8,48,.86);color:#fff;font:600 11px Poppins,sans-serif;pointer-events:none;';
      document.body.appendChild(element);
    }
    element.textContent = value;
  }

  function ensureDiceAnimationStyles() {
    if ($('sudDiceAnimationStyles')) return;
    const style = document.createElement('style');
    style.id = 'sudDiceAnimationStyles';
    style.textContent = '@keyframes sudDiceRoll{0%{transform:rotate(0deg) scale(1)}25%{transform:rotate(-18deg) scale(1.08)}50%{transform:rotate(22deg) scale(1.12)}75%{transform:rotate(-14deg) scale(1.06)}100%{transform:rotate(0deg) scale(1)}}.sud-dice-rolling{animation:sudDiceRoll .18s linear infinite;will-change:transform}.sud-dice-result{animation:sudDiceResult .35s cubic-bezier(.2,.8,.2,1)}@keyframes sudDiceResult{0%{transform:scale(.72) rotate(-8deg);opacity:.55}65%{transform:scale(1.12) rotate(3deg);opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}';
    document.head.appendChild(style);
  }

  function dice(a, b, resultAnimation = false) {
    const first = $('dice1');
    const second = $('dice2');
    if (first) first.textContent = a ?? '?';
    if (second) second.textContent = b ?? '?';
    if (resultAnimation) {
      [first, second].forEach((element) => {
        if (!element) return;
        element.classList.remove('sud-dice-rolling');
        element.classList.remove('sud-dice-result');
        void element.offsetWidth;
        element.classList.add('sud-dice-result');
      });
    }
  }

  function animateDice(final1, final2) {
    ensureDiceAnimationStyles();
    if (diceRollTimer) clearInterval(diceRollTimer);
    const first = $('dice1');
    const second = $('dice2');
    [first, second].forEach((element) => {
      if (!element) return;
      element.classList.remove('sud-dice-result');
      element.classList.add('sud-dice-rolling');
    });
    let elapsed = 0;
    diceRollTimer = setInterval(() => {
      elapsed += 90;
      if (elapsed >= 1050) {
        clearInterval(diceRollTimer);
        diceRollTimer = null;
        [first, second].forEach((element) => element && element.classList.remove('sud-dice-rolling'));
        dice(final1, final2, true);
        return;
      }
      if (first) first.textContent = 1 + Math.floor(Math.random() * 6);
      if (second) second.textContent = 1 + Math.floor(Math.random() * 6);
    }, 90);
  }

  function timerTick() {
    const left = Math.max(0, closeAt - Date.now());
    const seconds = Math.ceil(left / 1000);
    const progress = $('timerProgress');
    const circumference = 2 * Math.PI * 30;
    txt('timerText', status === 'BETTING_OPEN' ? seconds : '🎲');
    if (progress) {
      progress.style.strokeDasharray = circumference;
      progress.style.strokeDashoffset = circumference * (1 - Math.min(1, left / BET_MS));
    }
    ['btnBetDown', 'btnBetSeven', 'btnBetUp'].forEach((id) => {
      const element = $(id);
      if (element) element.classList.toggle('disabled', status !== 'BETTING_OPEN' || left <= 0);
    });
    if (left <= 0 && status === 'BETTING_OPEN') {
      status = 'BETTING_CLOSED';
      statusText('Betting Closed');
    }
  }

  function renderHistory() {
    const ribbon = $('historyRibbon');
    if (!ribbon) return;
    ribbon.innerHTML = '';
    history.slice(0, HISTORY).forEach((item) => {
      const number = Number(item.diceSum ?? item.sum ?? item.total);
      if (!number) return;
      const element = document.createElement('div');
      element.className = `badge-num ${number === 7 ? 'badge-blue' : number < 7 ? 'badge-red' : 'badge-green'}`;
      element.textContent = number;
      element.title = `Round ${item.roundNumber || item.roundId || ''}: ${item.dice1 || '?'} + ${item.dice2 || '?'} = ${number}`;
      ribbon.appendChild(element);
    });
  }

  function addHistory(item) {
    if (!item || !Number.isFinite(Number(item.diceSum)) || history.some((entry) => entry.roundId === item.roundId)) return;
    history.unshift(item);
    history = history.slice(0, HISTORY);
    renderHistory();
  }

  function apply(roundData, remaining) {
    if (!roundData) return;
    const previousRoundId = round;
    round = roundData.roundId || roundData.id || round;
    status = roundData.status || 'BETTING_OPEN';
    const parsedRemaining = Number(remaining);
    if (status === 'BETTING_OPEN' && Number.isFinite(parsedRemaining)) {
      closeAt = Date.now() + Math.max(0, parsedRemaining);
    } else if (status === 'BETTING_OPEN' && previousRoundId !== round) {
      closeAt = Date.now() + BET_MS;
    } else if (status !== 'BETTING_OPEN') {
      closeAt = Date.now();
    }
    if (roundData.dice1 != null && roundData.status !== 'RESULT') dice(roundData.dice1, roundData.dice2);
    if (roundData.status === 'SETTLED') addHistory(roundData);
    statusText(`Round ${roundData.roundNumber || ''} • ${status === 'BETTING_OPEN' ? 'Betting Open' : status}`);
    if (!timer) timer = setInterval(timerTick, 100);
    timerTick();
  }

  async function sync() {
    try {
      const body = await api('/api/games/7updown/current-round');
      if (body?.status === 'success') {
        const data = body.data || {};
        apply(data.currentRound || data, data.timeRemainingMs);
      }
    } catch (error) {
      statusText(error.message.includes('401') ? 'Game session expired' : 'Reconnecting…');
    }
  }

  async function loadHistory() {
    try {
      const body = await api(`/api/games/7updown/history?limit=${HISTORY}`);
      if (body?.status === 'success' && Array.isArray(body.data)) {
        history = body.data.slice(0, HISTORY);
        renderHistory();
      }
    } catch (_) {}
  }

  function resetBets() {
    window.__SUD_BETS = { DOWN: 0, SEVEN: 0, UP: 0 };
    window.__SUD_TOTAL = 0;
    txt('badgeDown', money(0));
    txt('badgeSeven', money(0));
    txt('badgeUp', money(0));
    txt('totalTableBetVal', money(0));
  }

  function open(event) {
    round = event?.roundId || round;
    status = 'BETTING_OPEN';
    closeAt = Date.now() + Number(event?.bettingDurationSeconds || 15) * 1000;
    resetBets();
    statusText('Betting Open');
    timerTick();
  }

  function result(event) {
    if (!event) return;
    status = 'RESULT';
    const first = Number(event.dice1);
    const second = Number(event.dice2);
    const sum = Number(event.diceSum ?? event.sum);
    window.__SUD_LAST = { roundId: event.roundId || round, dice1: first, dice2: second, diceSum: sum, winningBetType: event.winningBetType || type(sum) };
    animateDice(first, second);
    statusText(`${first} + ${second} = ${sum} • ${event.winningBetType || type(sum)}`);
    timerTick();
  }

  function settled(event) {
    status = 'SETTLED';
    if (window.__SUD_LAST) addHistory(window.__SUD_LAST);
    resetBets();
    statusText('Round Settled');
    window.parent?.postMessage?.({ source: 'ingames-game', version: 1, type: 'ROUND_RESULT', roundId: event?.roundId || round }, '*');
  }

  async function bet(kind) {
    if (status !== 'BETTING_OPEN' || Date.now() >= closeAt) {
      statusText('Betting closed');
      return;
    }
    if (!round) {
      await sync();
      if (!round) return;
    }
    const amount = Number(window.__SUD_SELECTED_CHIP || 10);
    try {
      const id = `${round}:${kind}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      const body = await api('/api/games/7updown/bets', {
        method: 'POST',
        body: JSON.stringify({ roundId: round, bets: [{ betType: kind, stake: amount, idempotencyKey: id }] }),
      });
      if (body?.status !== 'success') throw new Error(body?.message || 'Bet rejected');
      window.__SUD_BETS[kind] += amount;
      window.__SUD_TOTAL += amount;
      txt(kind === 'DOWN' ? 'badgeDown' : kind === 'SEVEN' ? 'badgeSeven' : 'badgeUp', money(window.__SUD_BETS[kind]));
      txt('totalTableBetVal', money(window.__SUD_TOTAL));
      statusText(`${kind} • ${money(amount)} accepted`);
      window.parent?.postMessage?.({ source: 'ingames-game', version: 1, type: 'WALLET_UPDATED', balance: body.data?.wallet?.totalBalance ?? body.data?.wallet?.cashBalance }, '*');
    } catch (error) {
      statusText(error.message || 'Bet rejected');
    }
  }

  function socket() {
    if (typeof window.io !== 'function') {
      statusText('Live connection unavailable');
      return;
    }
    const socket = window.io(base || undefined, {
      auth: token ? { token } : {},
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
    });
    socket.on('connect', () => {
      statusText('Live • Connected');
      sync();
      loadHistory();
    });
    socket.on('disconnect', () => statusText('Live • Reconnecting…'));
    socket.on('7ud:round_open', open);
    socket.on('GAME_ROUND_OPEN', (event) => open(event?.payload || event));
    socket.on('7ud:dice_rolled', result);
    socket.on('GAME_RESULT', (event) => result(event?.payload || event));
    socket.on('7ud:round_settled', settled);
    socket.on('GAME_ROUND_SETTLED', (event) => settled(event?.payload || event));
  }

  function bind() {
    window.__SUD_SELECTED_CHIP = 10;
    resetBets();
    ensureDiceAnimationStyles();
    const map = { btnBetDown: 'DOWN', btnBetSeven: 'SEVEN', btnBetUp: 'UP' };
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('[id]') : null;
      if (!target || !map[target.id]) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      bet(map[target.id]);
    }, true);
    document.addEventListener('click', (event) => {
      const chip = event.target instanceof Element ? event.target.closest('.pop-chip[data-val]') : null;
      if (!chip) return;
      const value = Number(chip.dataset.val);
      if (value > 0) {
        window.__SUD_SELECTED_CHIP = value;
        const popup = $('chipRadialPopup');
        if (popup) popup.classList.remove('active', 'show');
        statusText(`Chip selected • ${money(value)}`);
      }
    }, true);
    const settings = $('btnSettings');
    const modal = $('settingsModal');
    const close = $('btnCloseSettings');
    if (settings && modal) settings.addEventListener('click', () => modal.classList.add('active'));
    if (close && modal) close.addEventListener('click', () => modal.classList.remove('active'));
    if (modal) modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.classList.remove('active');
    });
    loadHistory();
    sync();
    socket();
    setInterval(sync, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
})();
