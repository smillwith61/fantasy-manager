import { SocketClient } from '../network/SocketClient.js';

export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  preload() {
    this.load.image('stadium', '/assets/stadium.png');
  }

  create() {
    this.unsubs  = [];
    this._inputs = [];

    this._injectCSS();

    SocketClient.connect().then(() => {
      this.unsubs.push(SocketClient.on('room_created', () => {
        if (this.scene.isActive('MenuScene')) this.scene.start('LobbyScene');
      }));
      this.unsubs.push(SocketClient.on('room_joined', () => {
        if (this.scene.isActive('MenuScene')) this.scene.start('LobbyScene');
      }));
      this.unsubs.push(SocketClient.on('join_error',   msg => this._showError(msg)));
      this.unsubs.push(SocketClient.on('create_error', msg => this._showError(msg)));
      if (this.scene.isActive('MenuScene')) this._rebuild();
    });

    this.scale.on('resize', () => this._rebuild(), this);
    this.events.on('shutdown', () => this._cleanup(), this);
    this._rebuild();
  }

  // ── Full rebuild ───────────────────────────────────────────────────────────
  _rebuild() {
    this._inputs.forEach(id => document.getElementById(id)?.remove());
    this._inputs = [];
    this.children.removeAll(true);

    const W   = this.scale.width;
    const H   = this.scale.height;
    const s   = Math.min(W / 1280, H / 720);
    const CX  = W / 2;
    const rect = this.game.canvas.getBoundingClientRect();
    const fs  = n => `${Math.round(n * s)}px`;

    // ── Stadium background ──────────────────────────────────────────────────
    if (this.textures.exists('stadium')) {
      const img = this.add.image(CX, H / 2, 'stadium');
      img.setScale(Math.max(W / img.width, H / img.height));
    } else {
      const fbg = this.add.graphics();
      fbg.fillStyle(0x1e7a32, 1); fbg.fillRect(0, 0, W, H);
    }

    // Gradient overlay: transparent top → dark bottom (stadium stays visible)
    const ov = this.add.graphics();
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const t     = i / (steps - 1);
      // Ease: slow fade at top, fast at bottom
      const alpha = Math.pow(t, 1.6) * 0.82;
      const sliceH = Math.ceil(H / steps) + 1;
      ov.fillStyle(0x000000, alpha);
      ov.fillRect(0, Math.floor(i * H / steps), W, sliceH);
    }
    // Extra dark strip at very bottom (below cards)
    ov.fillStyle(0x000000, 0.55); ov.fillRect(0, H * 0.72, W, H * 0.28);

    // Side vignette only
    const vig = this.add.graphics();
    for (let i = 0; i < 5; i++) {
      const inset = (i + 1) * Math.round(40 * s);
      vig.fillStyle(0x000000, 0.07);
      vig.fillRect(0, 0, inset, H);
      vig.fillRect(W - inset, 0, inset, H);
    }

    // ── Top bar ─────────────────────────────────────────────────────────────
    const barH = Math.round(58 * s);
    const topG = this.add.graphics();
    topG.fillStyle(0x000000, 0.75); topG.fillRect(0, 0, W, barH);
    // Gold line
    topG.fillStyle(0xffd600, 1); topG.fillRect(0, barH - 2, W, 2);
    // Fade below bar
    topG.fillStyle(0x000000, 0.25); topG.fillRect(0, barH, W, Math.round(20 * s));

    // Decorative accent lines flanking title
    const lineG = this.add.graphics();
    lineG.lineStyle(1, 0xffd600, 0.25);
    lineG.lineBetween(Math.round(20 * s), barH / 2, CX - Math.round(200 * s), barH / 2);
    lineG.lineBetween(CX + Math.round(200 * s), barH / 2, W - Math.round(120 * s), barH / 2);

    // Title — single centered text
    this.add.text(CX, barH / 2, '⚽  FANTASY MANAGER', {
      fontSize: fs(26), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold',
      color: '#ffffff',
      shadow: { offsetX: 0, offsetY: 0, color: '#00c853', blur: 16, fill: true },
    }).setOrigin(0.5);

    // Season tag — leave gap for debug button (40px from right)
    this.add.text(W - Math.round(52 * s), barH / 2, 'SAISON 2025/26', {
      fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ffd600',
    }).setOrigin(1, 0.5);

    // ── Card layout ──────────────────────────────────────────────────────────
    const gap   = Math.round(24 * s);
    const cardW = Math.min(Math.round(520 * s), (W - gap * 3) / 2);
    const cardH = Math.round(320 * s);
    // Shift cards into lower 60% so stadium is visible above
    const availTop = barH + (H - barH) * 0.30;
    const cardY = availTop + ((H - availTop - cardH) / 2);
    const leftX  = CX - gap / 2 - cardW;
    const rightX = CX + gap / 2;

    // ── LEFT card — Erstellen ─────────────────────────────────────────────
    this._drawCard(leftX, cardY, cardW, cardH, 0x00c853, 0x003a18, s);

    // Card header bg
    const lhG = this.add.graphics();
    lhG.fillStyle(0x003a18, 0.9);
    lhG.fillRoundedRect(leftX, cardY, cardW, Math.round(52 * s),
      { tl: 14, tr: 14, bl: 0, br: 0 });
    this.add.text(leftX + cardW / 2, cardY + Math.round(26 * s),
      '🏟  RAUM ERSTELLEN', {
        fontSize: fs(18), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#00e676',
        shadow: { offsetX: 0, offsetY: 0, color: '#00c853', blur: 10, fill: true },
      }).setOrigin(0.5);

    const nCP = cardY + Math.round(68 * s);
    this._phLabel(leftX + Math.round(22 * s), nCP, 'DEIN NAME', s, '#00c853');
    this._nativeInput(rect, s,
      leftX + Math.round(22 * s), nCP + Math.round(18 * s),
      cardW - Math.round(44 * s), Math.round(48 * s),
      'Manager Alpha', 'fm-name-create', false, false, false);

    this._phBtn(
      leftX + Math.round(22 * s), cardY + cardH - Math.round(68 * s),
      cardW - Math.round(44 * s), Math.round(50 * s),
      '▶  RAUM ERSTELLEN', 0x00c853, '#fff', s,
      () => {
        const name = (document.getElementById('fm-name-create')?.value || '').trim() || 'Manager Alpha';
        SocketClient.emit('create_room', { name });
      }
    );

    // ── RIGHT card — Beitreten ────────────────────────────────────────────
    this._drawCard(rightX, cardY, cardW, cardH, 0x2979ff, 0x001a40, s);

    const rhG = this.add.graphics();
    rhG.fillStyle(0x001a40, 0.9);
    rhG.fillRoundedRect(rightX, cardY, cardW, Math.round(52 * s),
      { tl: 14, tr: 14, bl: 0, br: 0 });
    this.add.text(rightX + cardW / 2, cardY + Math.round(26 * s),
      '🔗  RAUM BEITRETEN', {
        fontSize: fs(18), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#82b1ff',
        shadow: { offsetX: 0, offsetY: 0, color: '#2979ff', blur: 10, fill: true },
      }).setOrigin(0.5);

    const nJP = cardY + Math.round(68 * s);
    this._phLabel(rightX + Math.round(22 * s), nJP, 'DEIN NAME', s, '#5599ff');
    this._nativeInput(rect, s,
      rightX + Math.round(22 * s), nJP + Math.round(18 * s),
      cardW - Math.round(44 * s), Math.round(48 * s),
      'Manager Beta', 'fm-name-join', false, false, true);

    const cP = nJP + Math.round(84 * s);
    this._phLabel(rightX + Math.round(22 * s), cP, 'RAUM-CODE', s, '#5599ff');
    this._nativeInput(rect, s,
      rightX + Math.round(22 * s), cP + Math.round(18 * s),
      cardW - Math.round(44 * s), Math.round(48 * s),
      'Z.B. ABC123', 'fm-code', true, true, true);

    this._phBtn(
      rightX + Math.round(22 * s), cardY + cardH - Math.round(68 * s),
      cardW - Math.round(44 * s), Math.round(50 * s),
      '🔗  BEITRETEN', 0x2979ff, '#fff', s,
      () => {
        const name = (document.getElementById('fm-name-join')?.value || '').trim() || 'Manager Beta';
        const code = (document.getElementById('fm-code')?.value || '').trim().toUpperCase();
        if (!code) { this._showError('Bitte einen Raum-Code eingeben!'); return; }
        SocketClient.emit('join_room', { name, code });
      }
    );

    // ── Status dot + pulsing glow ─────────────────────────────────────────
    const connected = SocketClient.isConnected;
    const dotCol    = connected ? 0x00e676 : 0xf44336;
    const dotX      = Math.round(16 * s);
    const dotY      = H - Math.round(16 * s);
    const dotR      = Math.round(6 * s);
    const ringR     = Math.round(12 * s);

    // Pulsing glow ring — separate graphics so tween can animate its alpha
    const ringG = this.add.graphics();
    const drawRing = (alpha) => {
      ringG.clear();
      ringG.fillStyle(dotCol, alpha);
      ringG.fillCircle(dotX, dotY, ringR);
    };
    drawRing(0.25);
    this.tweens.add({
      targets: ringG, alpha: { from: 1, to: 0.2 },
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      onUpdate: () => drawRing(ringG.alpha * 0.35),
    });

    // Solid dot on top
    const dotG = this.add.graphics();
    dotG.fillStyle(dotCol, 1);
    dotG.fillCircle(dotX, dotY, dotR);

    this.add.text(Math.round(30 * s), H - Math.round(23 * s),
      connected ? 'Verbunden' : 'Verbinde…', {
        fontSize: fs(12), fontFamily: 'Rajdhani, Arial', fontStyle: 'bold',
        color: connected ? '#00e676' : '#f44336',
      });

    // Error text
    this._errorTxt = this.add.text(CX, cardY + cardH + Math.round(18 * s), '', {
      fontSize: fs(14), fontFamily: 'Rajdhani, Arial', fontStyle: 'bold', color: '#ff5252',
      shadow: { offsetX: 0, offsetY: 2, color: '#000', blur: 6, fill: true },
    }).setOrigin(0.5);
  }

  // ── Card with glow ────────────────────────────────────────────────────────
  _drawCard(x, y, w, h, accentCol, innerCol, s) {
    const g = this.add.graphics();

    // Glow: filled semi-transparent rects INSIDE the card boundary, no bleed
    const glowSteps = 5;
    for (let i = glowSteps; i >= 1; i--) {
      const shrink = i * Math.round(2 * s);
      g.fillStyle(accentCol, 0.022 * i);
      g.fillRoundedRect(x - shrink, y - shrink, w + shrink * 2, h + shrink * 2, 14 + shrink);
    }

    // Card background
    g.fillStyle(0x060e14, 0.90);
    g.fillRoundedRect(x, y, w, h, 14);

    // Inner top gradient
    g.fillStyle(innerCol, 0.45);
    g.fillRoundedRect(x, y, w, Math.round(h * 0.38), { tl: 14, tr: 14, bl: 0, br: 0 });

    // Border
    g.lineStyle(2, accentCol, 1);
    g.strokeRoundedRect(x, y, w, h, 14);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  _phLabel(x, y, text, s, color = '#4a7a4a') {
    this.add.text(x, y, text, {
      fontSize: `${Math.round(10 * s)}px`,
      fontFamily: 'Oswald, Arial', fontStyle: 'bold', color,
    });
  }

  _nativeInput(canvasRect, s, x, y, w, h, placeholder, id, mono, isCode, blue = false) {
    document.getElementById(id)?.remove();
    const input = document.createElement('input');
    input.id          = id;
    input.type        = 'text';
    input.placeholder = placeholder;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    if (isCode) input.maxLength = 8;

    const borderColor = blue ? '#1a3a6a' : '#1a3a2a';
    const focusColor  = blue ? '#2979ff' : '#00c853';
    const focusShadow = blue ? 'rgba(41,121,255,0.35)' : 'rgba(0,200,83,0.35)';

    Object.assign(input.style, {
      position:      'fixed',
      left:          `${canvasRect.left + x}px`,
      top:           `${canvasRect.top  + y}px`,
      width:         `${w}px`,
      height:        `${h}px`,
      background:    '#060e14',
      color:         '#ffffff',
      border:        `2px solid ${borderColor}`,
      borderRadius:  '8px',
      padding:       '0 16px',
      fontSize:      `${Math.round(16 * s)}px`,
      fontFamily:    mono ? "'Courier New', monospace" : "'Rajdhani', Arial, sans-serif",
      fontWeight:    '600',
      textTransform: mono ? 'uppercase' : 'none',
      letterSpacing: mono ? '5px' : '0',
      outline:       'none',
      boxSizing:     'border-box',
      zIndex:        '100',
      transition:    'border-color 0.2s, box-shadow 0.2s',
    });

    input.addEventListener('focus', () => {
      input.style.borderColor = focusColor;
      input.style.boxShadow   = `0 0 0 3px ${focusShadow}, 0 0 16px ${focusShadow}`;
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = borderColor;
      input.style.boxShadow   = 'none';
    });

    document.body.appendChild(input);
    this._inputs.push(id);
  }

  _phBtn(x, y, w, h, text, bgInt, fgHex, s, onClick) {
    const gfx = this.add.graphics();
    const r   = 10;
    const draw = (hover) => {
      gfx.clear();
      // Glow behind button
      if (!hover) {
        gfx.fillStyle(bgInt, 0.2);
        gfx.fillRoundedRect(x - 4, y - 4, w + 8, h + 8, r + 4);
      }
      gfx.fillStyle(bgInt, hover ? 0.80 : 1);
      gfx.fillRoundedRect(x, y, w, h, r);
      // Shine strip at top
      gfx.fillStyle(0xffffff, hover ? 0 : 0.10);
      gfx.fillRoundedRect(x + 2, y + 2, w - 4, Math.round(h * 0.35), { tl: r, tr: r, bl: 0, br: 0 });
    };
    draw(false);

    this.add.text(x + w / 2, y + h / 2, text, {
      fontSize: `${Math.round(15 * s)}px`,
      fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: fgHex,
      shadow: { offsetX: 0, offsetY: 1, color: '#000', blur: 4, fill: true },
    }).setOrigin(0.5);

    const zone = this.add.zone(x, y, w, h).setOrigin(0).setInteractive({ cursor: 'pointer' });
    zone.on('pointerover',  () => draw(true));
    zone.on('pointerout',   () => draw(false));
    zone.on('pointerdown',  onClick);
  }

  _showError(msg) {
    if (!this._errorTxt) return;
    this._errorTxt.setText('⚠  ' + msg);
    this.time.delayedCall(4000, () => { if (this._errorTxt) this._errorTxt.setText(''); });
  }

  _injectCSS() {
    if (document.getElementById('fm-menu-css')) return;
    const el = document.createElement('style');
    el.id = 'fm-menu-css';
    el.textContent = `
      #fm-name-create::placeholder { color: #1a4a2a; }
      #fm-name-join::placeholder   { color: #1a3060; }
      #fm-code::placeholder        { color: #1a3060; font-family: 'Courier New', monospace; }
    `;
    document.head.appendChild(el);
  }

  _cleanup() {
    this._inputs.forEach(id => document.getElementById(id)?.remove());
    this._inputs = [];
  }

  shutdown() {
    this._cleanup();
    this.scale.off('resize', this._rebuild, this);
    this.unsubs.forEach(u => u?.());
  }
}
