import { SocketClient }                 from '../network/SocketClient.js';
import { CLUBS }                        from '../data/clubs.js';
import { addStadiumBg, preloadStadium } from '../ui/SceneBackground.js';

// ─────────────────────────────────────────────────────────────────────────────
// LobbyScene
// ─────────────────────────────────────────────────────────────────────────────
export class LobbyScene extends Phaser.Scene {
  constructor() { super('LobbyScene'); }

  preload() { preloadStadium(this); }

  create() {
    this.objects = [];
    this.unsubs  = [];

    this.scale.on('resize', () => this.redraw(), this);
    this.events.on('shutdown', () => this._onShutdown(), this);

    this.unsubs.push(SocketClient.on('player_joined',       () => this.redraw()));
    this.unsubs.push(SocketClient.on('player_disconnected', () => this.redraw()));
    this.unsubs.push(SocketClient.on('game_started',        () => this.scene.start('AuctionScene')));

    this.redraw();
  }

  redraw() {
    this.objects.forEach(o => { try { o?.destroy(); } catch (_) {} });
    this.objects = [];

    const W  = this.scale.width;
    const H  = this.scale.height;
    const s  = Math.min(W / 1280, H / 720);
    const CX = W / 2;

    const pub     = SocketClient.publicState;
    const players = pub?.players ?? [];
    const code    = SocketClient.roomCode ?? '------';
    const isHost  = SocketClient.isHost;
    const fs      = n => `${Math.round(n * s)}px`;

    // ── Background: stadium + overlay ────────────────────────────────────
    addStadiumBg(this, this.objects, W, H);

    // ── Top bar ───────────────────────────────────────────────────────────
    const barH = Math.round(60 * s);
    const topBg = this.add.graphics();
    topBg.fillStyle(0x061008, 0.92);
    topBg.fillRect(0, 0, W, barH);
    topBg.fillStyle(0xffd600, 1);
    topBg.fillRect(0, barH - 3, W, 3);
    this.objects.push(topBg);

    this.objects.push(this.add.text(Math.round(18 * s), barH / 2, '⚽  FANTASY MANAGER', {
      fontSize: fs(22), fontFamily: 'Oswald, Arial Black, Arial',
      fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0, 0.5));

    this.objects.push(this.add.text(W - Math.round(18 * s), barH / 2, 'LOBBY', {
      fontSize: fs(14), fontFamily: 'Oswald, Arial',
      fontStyle: 'bold', color: '#ffd600',
    }).setOrigin(1, 0.5));

    // ── Room code box ─────────────────────────────────────────────────────
    const codeBoxW = Math.round(320 * s);
    const codeBoxH = Math.round(72 * s);
    const codeBoxX = CX - codeBoxW / 2;
    const codeBoxY = barH + Math.round(20 * s);

    const codeGfx = this.add.graphics();
    // Glow (fill-based, no bleed)
    for (let i = 6; i >= 1; i--) {
      const sh = i * Math.round(2 * s);
      codeGfx.fillStyle(0xffd600, 0.022 * i);
      codeGfx.fillRoundedRect(codeBoxX - sh, codeBoxY - sh,
        codeBoxW + sh * 2, codeBoxH + sh * 2, 14 + sh);
    }
    codeGfx.fillStyle(0x060e14, 0.90);
    codeGfx.fillRoundedRect(codeBoxX, codeBoxY, codeBoxW, codeBoxH, 14);
    codeGfx.fillStyle(0xffd600, 0.40);
    codeGfx.fillRoundedRect(codeBoxX, codeBoxY, codeBoxW, Math.round(codeBoxH * 0.38), 14);
    codeGfx.lineStyle(2, 0xffd600, 1);
    codeGfx.strokeRoundedRect(codeBoxX, codeBoxY, codeBoxW, codeBoxH, 14);
    this.objects.push(codeGfx);

    this.objects.push(this.add.text(CX, codeBoxY + Math.round(14 * s), 'RAUM-CODE', {
      fontSize: fs(9), fontFamily: 'Oswald, Arial', color: '#ccaa00',
    }).setOrigin(0.5));

    this.objects.push(this.add.text(CX, codeBoxY + Math.round(46 * s), code, {
      fontSize: fs(28), fontFamily: "'Courier New', monospace",
      fontStyle: 'bold', color: '#ffd600',
    }).setOrigin(0.5));

    // Copy button
    const copyBtnW = Math.round(100 * s);
    const copyBtnH = Math.round(28 * s);
    const copyBtnX = codeBoxX + codeBoxW + Math.round(10 * s);
    const copyBtnY = codeBoxY + (codeBoxH - copyBtnH) / 2;
    const copyGfx  = this.add.graphics();
    copyGfx.fillStyle(0xffd600, 1);
    copyGfx.fillRoundedRect(copyBtnX, copyBtnY, copyBtnW, copyBtnH, 6);
    this.objects.push(copyGfx);
    this.objects.push(this.add.text(copyBtnX + copyBtnW / 2, copyBtnY + copyBtnH / 2,
      '📋 KOPIEREN', { fontSize: fs(10), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#000' }
    ).setOrigin(0.5));

    const copyZone = this.add.zone(copyBtnX, copyBtnY, copyBtnW, copyBtnH).setOrigin(0).setInteractive({ cursor: 'pointer' });
    copyZone.on('pointerdown', () => {
      navigator.clipboard?.writeText(code).then(() => {
        copyGfx.clear();
        copyGfx.fillStyle(0x00c853, 1);
        copyGfx.fillRoundedRect(copyBtnX, copyBtnY, copyBtnW, copyBtnH, 6);
        this.time.delayedCall(1200, () => {
          copyGfx.clear();
          copyGfx.fillStyle(0xffd600, 1);
          copyGfx.fillRoundedRect(copyBtnX, copyBtnY, copyBtnW, copyBtnH, 6);
        });
      });
    });
    this.objects.push(copyZone);

    // ── Player cards grid — 2 rows × 4 cols ──────────────────────────────
    const gridTop = codeBoxY + codeBoxH + Math.round(20 * s);
    const botBarH = Math.round(72 * s);
    const gridH   = H - gridTop - botBarH - Math.round(12 * s);

    const COLS    = 4;
    const ROWS    = 2;
    const SLOTS   = COLS * ROWS;
    const cardGap = Math.round(14 * s);
    const padX    = Math.round(40 * s);

    const cardW   = Math.round((W - padX * 2 - cardGap * (COLS - 1)) / COLS);
    const cardH   = Math.round((gridH - cardGap * (ROWS - 1)) / ROWS);

    for (let i = 0; i < SLOTS; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx  = padX + col * (cardW + cardGap);
      const cy  = gridTop + row * (cardH + cardGap);
      const p   = players[i];
      if (p) this._drawPlayerCard(cx, cy, cardW, cardH, p, s);
      else   this._drawEmptySlot(cx, cy, cardW, cardH, s);
    }

    // ── Bottom bar ────────────────────────────────────────────────────────
    const bbY = H - botBarH;
    const botBg = this.add.graphics();
    botBg.fillStyle(0x061008, 0.92);
    botBg.fillRect(0, bbY, W, botBarH);
    botBg.fillStyle(0xffd600, 0.20);
    botBg.fillRect(0, bbY, W, 1);
    this.objects.push(botBg);

    if (isHost) {
      if (players.length >= 2) {
        const btnW = Math.round(280 * s);
        const btnH = Math.round(44 * s);
        const btnX = CX - btnW / 2;
        const btnY = bbY + (botBarH - btnH) / 2;

        const btnGfx = this.add.graphics();
        btnGfx.fillStyle(0x00c853, 1);
        btnGfx.fillRoundedRect(btnX, btnY, btnW, btnH, 10);
        this.objects.push(btnGfx);

        this.objects.push(this.add.text(CX, btnY + btnH / 2,
          `▶  SPIEL STARTEN  (${players.length} Spieler)`, {
            fontSize: fs(15), fontFamily: 'Oswald, Arial Black, Arial',
            fontStyle: 'bold', color: '#000000',
          }).setOrigin(0.5));

        const startZone = this.add.zone(btnX, btnY, btnW, btnH).setOrigin(0).setInteractive({ cursor: 'pointer' });
        startZone.on('pointerover',  () => { btnGfx.clear(); btnGfx.fillStyle(0x00e676, 1); btnGfx.fillRoundedRect(btnX, btnY, btnW, btnH, 10); });
        startZone.on('pointerout',   () => { btnGfx.clear(); btnGfx.fillStyle(0x00c853, 1); btnGfx.fillRoundedRect(btnX, btnY, btnW, btnH, 10); });
        startZone.on('pointerdown',  () => SocketClient.emit('start_game'));
        this.objects.push(startZone);
      } else {
        this.objects.push(this.add.text(CX, bbY + botBarH / 2,
          '⏳  Warte auf mindestens einen weiteren Spieler…', {
            fontSize: fs(14), fontFamily: 'Rajdhani, Arial', color: '#5a8a5a',
          }).setOrigin(0.5));
      }
    } else {
      this.objects.push(this.add.text(CX, bbY + botBarH / 2,
        '⏳  Warte auf den Host…', {
          fontSize: fs(14), fontFamily: 'Rajdhani, Arial', color: '#5a8a5a',
        }).setOrigin(0.5));
    }

    this.objects.push(this.add.text(W - Math.round(16 * s), bbY + botBarH / 2,
      `${players.length} / 8 Spieler`, {
        fontSize: fs(12), fontFamily: 'Rajdhani, Arial',
        fontStyle: 'bold', color: '#ffd600',
      }).setOrigin(1, 0.5));
  }

  // ── Player card ───────────────────────────────────────────────────────────
  _drawPlayerCard(x, y, w, h, p, s) {
    const fs      = n => `${Math.round(n * s)}px`;
    const club    = CLUBS[p.clubId] ?? CLUBS[0];
    const isMe    = p.id === SocketClient.myPlayerId;
    const accent  = isMe ? 0xffd600 : club.color;

    const gfx = this.add.graphics();
    // Glow
    for (let i = 6; i >= 1; i--) {
      const shrink = i * Math.round(2 * s);
      gfx.fillStyle(accent, 0.022 * i);
      gfx.fillRoundedRect(x - shrink, y - shrink, w + shrink * 2, h + shrink * 2, 14 + shrink);
    }
    gfx.fillStyle(isMe ? 0x0d1a06 : 0x060e14, 0.92);
    gfx.fillRoundedRect(x, y, w, h, 14);
    gfx.fillStyle(accent, 0.35);
    gfx.fillRoundedRect(x, y, w, Math.round(h * 0.38), 14);
    gfx.lineStyle(2, accent, 1);
    gfx.strokeRoundedRect(x, y, w, h, 14);
    this.objects.push(gfx);

    // Online dot
    const dotG = this.add.graphics();
    dotG.fillStyle(p.connected ? 0x00e676 : 0xf44336, 1);
    dotG.fillCircle(x + Math.round(10 * s), y + Math.round(12 * s), Math.round(4 * s));
    this.objects.push(dotG);

    if (p.isHost) {
      this.objects.push(this.add.text(x + w - Math.round(8 * s), y + Math.round(8 * s), '👑', {
        fontSize: fs(12),
      }).setOrigin(1, 0));
    }

    // Club badge
    const badgeCX = x + w / 2;
    const badgeCY = y + Math.round(56 * s);
    const badgeR  = Math.round(28 * s);
    const badgeG  = this.add.graphics();
    badgeG.fillStyle(club.color, 1);
    badgeG.fillCircle(badgeCX, badgeCY, badgeR);
    badgeG.fillStyle(0x000000, 0.3);
    badgeG.fillCircle(badgeCX, badgeCY, badgeR);
    this.objects.push(badgeG);
    this.objects.push(this.add.text(badgeCX, badgeCY, club.emoji ?? '🏟', {
      fontSize: fs(22),
    }).setOrigin(0.5));

    this.objects.push(this.add.text(x + w / 2, y + Math.round(98 * s), p.name, {
      fontSize: fs(13), fontFamily: 'Oswald, Arial Black, Arial',
      fontStyle: 'bold', color: isMe ? '#ffd600' : '#ffffff',
      wordWrap: { width: w - Math.round(12 * s) },
    }).setOrigin(0.5));

    this.objects.push(this.add.text(x + w / 2, y + Math.round(118 * s), club.name, {
      fontSize: fs(9), fontFamily: 'Rajdhani, Arial', color: '#7aa87a',
    }).setOrigin(0.5));

    if (isMe) {
      this.objects.push(this.add.text(x + w / 2, y + Math.round(138 * s), '● DU', {
        fontSize: fs(9), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ffd600',
      }).setOrigin(0.5));
    }
  }

  // ── Empty slot ────────────────────────────────────────────────────────────
  _drawEmptySlot(x, y, w, h, s) {
    const gfx = this.add.graphics();
    gfx.fillStyle(0x000000, 0.28);
    gfx.fillRoundedRect(x, y, w, h, 14);
    gfx.lineStyle(1, 0xffffff, 0.08);
    gfx.strokeRoundedRect(x, y, w, h, 14);
    this.objects.push(gfx);
    this.objects.push(this.add.text(x + w / 2, y + h / 2, '+ Wartend…', {
      fontSize: `${Math.round(13 * s)}px`,
      fontFamily: 'Oswald, Arial',
      color: '#ffffff',
      alpha: 0.30,
    }).setOrigin(0.5));
  }

  _onShutdown() {
    this.scale.off('resize', this.redraw, this);
    this.unsubs.forEach(u => u?.());
    this.objects.forEach(o => { try { o?.destroy(); } catch (_) {} });
  }

  shutdown() { this._onShutdown(); }
}
