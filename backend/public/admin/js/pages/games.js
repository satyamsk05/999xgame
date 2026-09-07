/** pages/games.js */
'use strict';

const PageGames = (() => {
  const _cfg = { gameId: null };

  async function load() {
    const wrap = document.getElementById('games-body');
    wrap.innerHTML = Skel.card(120) + '<div style="margin-top:16px">' + Skel.card(200) + '</div>';

    const res = await API.getGames();
    if (!res?.data) return;

    const games = res.data;

    wrap.innerHTML = `
      <div class="table-container mb-6">
        <div class="table-header">
          <div class="table-title">Game Catalog</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Game</th>
              <th>Status</th>
              <th>Min Stake</th>
              <th>Max Stake</th>
              <th>Entry Fee</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${games.map(g => `
              <tr>
                <td class="font-semi">${Fmt.esc(g.title)}</td>
                <td>${Badge.status(g.status)}</td>
                <td class="amount">₹${Fmt.paise(g.min_stake)}</td>
                <td class="amount">₹${Fmt.paise(g.max_stake)}</td>
                <td class="amount">₹${Fmt.paise(g.entry_fee)}</td>
                <td>
                  <div style="display:flex;gap:6px">
                    <button class="btn btn-ghost btn-sm"
                      onclick="PageGames.toggle('${g.id}')">
                      ${g.status === 'LIVE' ? 'Disable' : 'Enable'}
                    </button>
                    <button class="btn btn-ghost btn-sm"
                      onclick="PageGames.openConfig('${g.id}',${g.min_stake},${g.max_stake},${g.entry_fee})">
                      Config
                    </button>
                    <button class="btn btn-ghost btn-sm"
                      onclick="PageGames.loadRounds('${g.id}')">
                      Rounds
                    </button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div id="rounds-section" style="display:none">
        <div class="table-container">
          <div class="table-header">
            <div class="table-title" id="rounds-title">Recent Rounds</div>
            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('rounds-section').style.display='none'">Close</button>
          </div>
          <table>
            <thead>
              <tr><th>Round #</th><th>Status</th><th>Result</th><th>Started</th><th>Ended</th><th>Bets</th></tr>
            </thead>
            <tbody id="rounds-tbody">
              <tr><td colspan="6">${Skel.tableRows(6, 3)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  async function toggle(gameId) {
    const res = await API.toggleGame(gameId);
    if (res) {
      UI.toast(`Game ${res.data.status === 'LIVE' ? 'enabled' : 'disabled'}.`, 'success');
      load();
    }
  }

  function openConfig(gameId, minStake, maxStake, entryFee) {
    _cfg.gameId = gameId;
    document.getElementById('cfg-min').value   = (parseInt(minStake,  10) / 100).toFixed(0);
    document.getElementById('cfg-max').value   = (parseInt(maxStake,  10) / 100).toFixed(0);
    document.getElementById('cfg-entry').value = (parseInt(entryFee,  10) / 100).toFixed(0);
    UI.openModal('modal-game-config');
  }

  async function submitConfig() {
    const minStake  = parseFloat(document.getElementById('cfg-min').value);
    const maxStake  = parseFloat(document.getElementById('cfg-max').value);
    const entryFee  = parseFloat(document.getElementById('cfg-entry').value);
    const btn       = document.getElementById('cfg-submit');

    if (minStake <= 0 || maxStake <= 0 || entryFee < 0) {
      UI.toast('Enter valid values', 'error'); return;
    }

    UI.btnLoading(btn, true, 'Save');
    const res = await API.configGame(_cfg.gameId, { minStake, maxStake, entryFee });
    UI.btnLoading(btn, false, 'Save');

    if (res) {
      UI.toast('Game config updated.', 'success');
      UI.closeModal('modal-game-config');
      load();
    }
  }

  async function loadRounds(gameId) {
    document.getElementById('rounds-section').style.display = 'block';
    document.getElementById('rounds-title').textContent = `Recent Rounds — ${gameId}`;
    document.getElementById('rounds-tbody').innerHTML = Skel.tableRows(6, 4);

    const res = await API.getRounds(gameId, 20);
    if (!res?.data) return;

    document.getElementById('rounds-tbody').innerHTML = res.data.length
      ? res.data.map(r => `
          <tr>
            <td class="font-semi">#${r.round_number}</td>
            <td>${Badge.status(r.status)}</td>
            <td class="mono text-xs">${r.result ? JSON.stringify(r.result).slice(0, 30) : '—'}</td>
            <td class="text-xs text-dim">${Fmt.date(r.started_at)}</td>
            <td class="text-xs text-dim">${r.ended_at ? Fmt.date(r.ended_at) : '—'}</td>
            <td><button class="btn btn-ghost btn-sm" onclick="PageGames.loadBets('${gameId}','${r.id}')">Bets</button></td>
          </tr>`).join('')
      : `<tr><td colspan="6"><div class="empty empty-sub">No rounds found</div></td></tr>`;
  }

  async function loadBets(gameId, roundId) {
    const tbody = document.getElementById('rounds-tbody');
    tbody.innerHTML = Skel.tableRows(6, 4);

    const res = await API.getGameBets(gameId, roundId, 50);
    if (!res?.data) return;

    document.getElementById('rounds-title').textContent = `Bets for Round ${roundId.slice(-8)}`;
    tbody.innerHTML = res.data.length
      ? res.data.map(b => `
          <tr>
            <td class="text-sm">${Fmt.esc(b.username || b.user_id)}</td>
            <td>${Badge.status(b.status)}</td>
            <td class="mono text-xs">${Fmt.esc(b.bet_type)}</td>
            <td class="amount">₹${Fmt.paise(b.stake)}</td>
            <td class="${parseInt(b.win_amount,10) > 0 ? 'amount-pos' : 'amount-neg'}">
              ${parseInt(b.win_amount,10) > 0 ? '+₹' + Fmt.paise(b.win_amount) : '—'}
            </td>
            <td class="text-xs text-dim">${Fmt.timeAgo(b.created_at)}</td>
          </tr>`).join('')
      : `<tr><td colspan="6"><div class="empty empty-sub">No bets found</div></td></tr>`;
  }

  return { load, toggle, openConfig, submitConfig, loadRounds, loadBets };
})();
