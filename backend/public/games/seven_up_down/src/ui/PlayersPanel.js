export class PlayersPanel {
  constructor(el) {
    this.el = el;
    this.render();
  }

  render() {
    if (!this.el) return;
    this.el.innerHTML = `
      <div class="players-card-container">
        <!-- Player 1 (Crown Winner) -->
        <div class="player-stack-item">
          <div class="avatar-crown-wrap">
            <img src="/avatars/avatar_1.png" class="stack-avatar avatar-top" onerror="this.src='/avatars/avatar_1.png'" />
            <span class="crown-badge">👑</span>
          </div>
          <div class="stack-coin-row">
            <span class="stack-amt">₹5,488.13</span>
          </div>
        </div>

        <div class="stack-divider"></div>

        <!-- Player 2 -->
        <div class="player-stack-item">
          <div class="avatar-crown-wrap">
            <img src="/avatars/avatar_2.png" class="stack-avatar avatar-cyan" onerror="this.src='/avatars/avatar_2.png'" />
          </div>
          <div class="stack-coin-row">
            <span class="stack-amt">₹263.02</span>
          </div>
        </div>

        <div class="stack-divider"></div>

        <!-- Player 3 -->
        <div class="player-stack-item">
          <div class="avatar-crown-wrap">
            <img src="/avatars/avatar_3.png" class="stack-avatar avatar-pink" onerror="this.src='/avatars/avatar_3.png'" />
          </div>
          <div class="stack-coin-row">
            <span class="stack-amt">₹662.79</span>
          </div>
        </div>
      </div>
    `;
  }
}
