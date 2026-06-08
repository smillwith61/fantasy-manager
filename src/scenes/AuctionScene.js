import { SocketClient }                 from '../network/SocketClient.js';
import { addStadiumBg, preloadStadium } from '../ui/SceneBackground.js';

export class AuctionScene extends Phaser.Scene {
  constructor() { super('AuctionScene'); }

  preload() { preloadStadium(this); }

  create() {
    this.objects       = [];
    this.unsubs        = [];
    this.showingResult = false;
    this.timeLeft      = 20;

    this.scale.on('resize', () => { if (!this.showingResult) this.redraw(); }, this);
    this.events.on('shutdown', () => this._onShutdown(), this);

    this.unsubs.push(SocketClient.on('auction_update', s => {
      if (SocketClient.publicState) SocketClient.publicState.auction = s;
      this.timeLeft = s?.timeLeft ?? 20;
      if (!this.showingResult) this.redraw();
    }));
    this.unsubs.push(SocketClient.on('auction_tick', ({ timeLeft }) => {
      this.timeLeft = timeLeft;
      this._tickTimer(timeLeft);
    }));
    this.unsubs.push(SocketClient.on('auction_result', r => {
      this.showingResult = true;
      this._showResult(r);
      this.time.delayedCall(2800, () => {
        this.showingResult = false;
        this.timeLeft = 20;
        this.redraw();
      });
    }));
    this.unsubs.push(SocketClient.on('phase_changed', ({ phase }) => {
      if (phase === 'prep') this.scene.start('TeamScene');
    }));

    this.redraw();
  }

  redraw() {
    this.objects.forEach(o => { try { o?.destroy(); } catch (_) {} });
    this.objects    = [];
    this._timerTxt  = null;
    this._timerFg   = null;
    this._timerMeta = null;

    const W  = this.scale.width;
    const H  = this.scale.height;
    const s  = Math.min(W / 1280, H / 720);
    const CX = W / 2;
    const fs = n => `${Math.round(n * s)}px`;

    const pub     = SocketClient.publicState;
    const auction = pub?.auction;
    const players = pub?.players ?? [];
    const total   = pub?.totalAuctions ?? 0;
    const idx     = pub?.auctionIndex  ?? 0;

    // ── Background: stadium + overlay ────────────────────────────────────
    addStadiumBg(this, this.objects, W, H);

    // ── Top bar ───────────────────────────────────────────────────────────
    const barH = Math.round(52 * s);
    const topG = this.add.graphics();
    topG.fillStyle(0x061008, 0.92);
    topG.fillRect(0, 0, W, barH);
    topG.fillStyle(0xffd600, 1);
    topG.fillRect(0, barH - 2, W, 2);
    this.objects.push(topG);

    this.objects.push(this.add.text(Math.round(16 * s), barH / 2, '⚽  FANTASY MANAGER', {
      fontSize: fs(18), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#fff',
    }).setOrigin(0, 0.5));

    const displayIdx = auction ? idx + 1 : idx;
    this.objects.push(this.add.text(W - Math.round(16 * s), barH / 2,
      `AUKTION  ${displayIdx} / ${total}`, {
        fontSize: fs(14), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ffd600',
      }).setOrigin(1, 0.5));

    // Progress bar
    const pbG = this.add.graphics();
    pbG.fillStyle(0x000000, 0.4);
    pbG.fillRect(0, barH, W, Math.round(4 * s));
    if (total > 0) {
      pbG.fillStyle(0x00c853, 1);
      pbG.fillRect(0, barH, (displayIdx / total) * W, Math.round(4 * s));
    }
    this.objects.push(pbG);

    if (!auction) {
      this.objects.push(this.add.text(CX, H / 2, '⏳  Nächste Auktion startet…', {
        fontSize: fs(20), fontFamily: 'Oswald, Arial', color: '#ffffff',
      }).setOrigin(0.5));
      this._drawManagerList(players, W, barH + Math.round(8 * s),
        H - barH - Math.round(8 * s), s, null, undefined, undefined);
      this._drawHostControls(s);
      return;
    }

    // Layout
    const contentY = barH + Math.round(8 * s);
    const botBarH  = Math.round(120 * s);
    const contentH = H - contentY - botBarH - Math.round(8 * s);
    const gap      = Math.round(8 * s);
    const listW    = Math.round(210 * s);
    const cardW    = Math.round(250 * s);
    const midW     = W - cardW - listW - gap * 4;
    const cardX    = gap;
    const midX     = cardX + cardW + gap;
    const listX    = midX + midW + gap;

    this._drawPlayerCard(auction.player, cardX, contentY, cardW, contentH, s);
    this._drawCenter(auction, players, midX, contentY, midW, contentH, s);
    this._drawManagerList(players, W, contentY, contentH, s, auction, listX, listW);
    this._drawBidBar(auction, H - botBarH, W, botBarH, s);
    this._drawHostControls(s);
  }

  _drawPlayerCard(player, x, y, w, h, s) {
    const fs     = n => `${Math.round(n * s)}px`;
    const posCol = { GK: 0xf39c12, DEF: 0x27ae60, MID: 0x3498db, FWD: 0xe74c3c }[player.pos] ?? 0x888888;

    const gfx = this.add.graphics();
    // Fill-based glow (no bleed between adjacent cards)
    for (let i = 6; i >= 1; i--) {
      const shrink = i * Math.round(2 * s);
      gfx.fillStyle(posCol, 0.022 * i);
      gfx.fillRoundedRect(x - shrink, y - shrink, w + shrink * 2, h + shrink * 2, 14 + shrink);
    }
    gfx.fillStyle(0x060e14, 0.92);
    gfx.fillRoundedRect(x, y, w, h, 14);
    gfx.fillStyle(posCol, 0.40);
    gfx.fillRoundedRect(x, y, w, Math.round(h * 0.20), 14);
    gfx.lineStyle(2, posCol, 1);
    gfx.strokeRoundedRect(x, y, w, h, 14);
    this.objects.push(gfx);

    const bW = Math.round(44 * s), bH2 = Math.round(20 * s);
    const bG = this.add.graphics();
    bG.fillStyle(posCol, 1);
    bG.fillRoundedRect(x + Math.round(10 * s), y + Math.round(12 * s), bW, bH2, 4);
    this.objects.push(bG);
    this.objects.push(this.add.text(x + Math.round(10 * s) + bW / 2, y + Math.round(22 * s), player.pos, {
      fontSize: fs(10), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#000',
    }).setOrigin(0.5));

    this.objects.push(this.add.text(x + w / 2, y + Math.round(46 * s), player.name, {
      fontSize: fs(19), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#fff',
    }).setOrigin(0.5));

    if (player.trait) {
      this.objects.push(this.add.text(x + w / 2, y + Math.round(68 * s), `★  ${player.trait}`, {
        fontSize: fs(10), fontFamily: 'Rajdhani, Arial', color: '#ce93d8',
      }).setOrigin(0.5));
    }

    const stats = [
      { icon: '⚔', label: 'Angriff',      v: player.atk, col: 0xe74c3c },
      { icon: '🛡', label: 'Verteidigung', v: player.def, col: 0x3498db },
      { icon: '⚡', label: 'Tempo',         v: player.spd, col: 0xf1c40f },
      { icon: '💪', label: 'Ausdauer',      v: player.sta, col: 0x9b59b6 },
    ];
    const sy0  = y + Math.round(88 * s);
    const rowH = Math.round(36 * s);
    const barW = w - Math.round(28 * s);

    stats.forEach(({ icon, label, v, col }, i) => {
      const sy = sy0 + i * rowH;
      this.objects.push(this.add.text(x + Math.round(14 * s), sy, `${icon}  ${label}`, {
        fontSize: fs(10), fontFamily: 'Rajdhani, Arial', color: '#cccccc',
      }));
      this.objects.push(this.add.text(x + w - Math.round(14 * s), sy, String(v), {
        fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#fff',
      }).setOrigin(1, 0));
      const bg2 = this.add.graphics();
      bg2.fillStyle(0x000000, 0.4);
      bg2.fillRoundedRect(x + Math.round(14 * s), sy + Math.round(15 * s), barW, Math.round(6 * s), 3);
      const fg = this.add.graphics();
      fg.fillStyle(col, 1);
      fg.fillRoundedRect(x + Math.round(14 * s), sy + Math.round(15 * s),
        Math.max(4, (v / 99) * barW), Math.round(6 * s), 3);
      this.objects.push(bg2, fg);
    });

    const valY = y + h - Math.round(32 * s);
    const vG = this.add.graphics();
    vG.fillStyle(0x1a1200, 1);
    vG.fillRoundedRect(x + Math.round(12 * s), valY, w - Math.round(24 * s), Math.round(26 * s), 7);
    vG.lineStyle(1, 0xffd600, 0.8);
    vG.strokeRoundedRect(x + Math.round(12 * s), valY, w - Math.round(24 * s), Math.round(26 * s), 7);
    this.objects.push(vG);
    this.objects.push(this.add.text(x + w / 2, valY + Math.round(13 * s),
      `💰  Marktwert: ${player.val}M`, {
        fontSize: fs(11), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ffd600',
      }).setOrigin(0.5));
  }

  _drawCenter(auction, players, x, y, w, h, s) {
    const fs  = n => `${Math.round(n * s)}px`;
    const cx2 = x + w / 2;

    const gfx = this.add.graphics();
    gfx.fillStyle(0x060e14, 0.90);
    gfx.fillRoundedRect(x, y, w, h, 14);
    gfx.lineStyle(1, 0x1e3a24, 1);
    gfx.strokeRoundedRect(x, y, w, h, 14);
    this.objects.push(gfx);

    // Timer
    const timerLY = y + Math.round(26 * s);
    this.objects.push(this.add.text(cx2, timerLY, 'ZEIT VERBLEIBEND', {
      fontSize: fs(9), fontFamily: 'Oswald, Arial', color: '#3a6a3a',
    }).setOrigin(0.5));

    const tc = this._timerColor(this.timeLeft);
    this._timerTxt = this.add.text(cx2, timerLY + Math.round(50 * s), String(this.timeLeft), {
      fontSize: fs(60), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: tc,
    }).setOrigin(0.5);
    this.objects.push(this._timerTxt);

    this.objects.push(this.add.text(cx2, timerLY + Math.round(84 * s), 'SEK', {
      fontSize: fs(9), fontFamily: 'Oswald, Arial', color: '#3a6a3a',
    }).setOrigin(0.5));

    const bY  = timerLY + Math.round(96 * s);
    const bW2 = w - Math.round(40 * s);
    const bH2 = Math.round(6 * s);
    const bBg = this.add.graphics();
    bBg.fillStyle(0x000000, 0.5);
    bBg.fillRoundedRect(x + Math.round(20 * s), bY, bW2, bH2, 3);
    this.objects.push(bBg);
    this._timerFg   = this.add.graphics();
    this._timerMeta = { x: x + Math.round(20 * s), y: bY, w: bW2, h: bH2 };
    this._drawTimerBar(this._timerMeta.x, bY, bW2, bH2, this.timeLeft, tc);
    this.objects.push(this._timerFg);

    const dY = bY + Math.round(18 * s);
    const dG = this.add.graphics();
    dG.lineStyle(1, 0x1a3a24, 1);
    dG.lineBetween(x + Math.round(20 * s), dY, x + w - Math.round(20 * s), dY);
    this.objects.push(dG);

    // Bid
    const bidLY = dY + Math.round(18 * s);
    this.objects.push(this.add.text(cx2, bidLY, 'HÖCHSTGEBOT', {
      fontSize: fs(9), fontFamily: 'Oswald, Arial', color: '#3a6a3a',
    }).setOrigin(0.5));

    const bidCol = auction.currentBid > 0 ? '#ffd600' : '#2a4a2a';
    this.objects.push(this.add.text(cx2, bidLY + Math.round(44 * s),
      auction.currentBid > 0 ? `${auction.currentBid}M` : '—', {
        fontSize: fs(46), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: bidCol,
      }).setOrigin(0.5));

    const lY = bidLY + Math.round(82 * s);
    if (auction.currentBidder !== null) {
      const bidder = players[auction.currentBidder];
      const isMe   = auction.currentBidder === SocketClient.myPlayerId;
      const lG = this.add.graphics();
      lG.fillStyle(isMe ? 0x004d20 : 0x0a1c0c, 1);
      lG.fillRoundedRect(x + Math.round(20 * s), lY - Math.round(10 * s),
        w - Math.round(40 * s), Math.round(30 * s), 7);
      lG.lineStyle(1, isMe ? 0x00c853 : 0x1a4a22, 1);
      lG.strokeRoundedRect(x + Math.round(20 * s), lY - Math.round(10 * s),
        w - Math.round(40 * s), Math.round(30 * s), 7);
      this.objects.push(lG);
      this.objects.push(this.add.text(cx2, lY + Math.round(5 * s),
        isMe ? '🏆  DU führst!' : `🏆  ${bidder?.name ?? '?'}`, {
          fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
          color: isMe ? '#00e676' : '#ffffff',
        }).setOrigin(0.5));
    } else {
      this.objects.push(this.add.text(cx2, lY + Math.round(5 * s), 'Noch kein Gebot', {
        fontSize: fs(12), fontFamily: 'Rajdhani, Arial', color: '#2a4a2a',
      }).setOrigin(0.5));
    }
  }

  _drawManagerList(players, W, contentY, contentH, s, auction, listX, listW) {
    if (listX === undefined) {
      listX = W - Math.round(218 * s);
      listW = Math.round(210 * s);
    }
    const fs = n => `${Math.round(n * s)}px`;

    const gfx = this.add.graphics();
    gfx.fillStyle(0x060e14, 0.90);
    gfx.fillRoundedRect(listX, contentY, listW, contentH, 14);
    gfx.lineStyle(1, 0x1e3a24, 1);
    gfx.strokeRoundedRect(listX, contentY, listW, contentH, 14);
    this.objects.push(gfx);

    this.objects.push(this.add.text(listX + listW / 2, contentY + Math.round(14 * s), 'MANAGER', {
      fontSize: fs(9), fontFamily: 'Oswald, Arial', color: '#3a6a3a',
    }).setOrigin(0.5));

    const rowH = Math.round(44 * s);
    players.forEach((p, i) => {
      const ry       = contentY + Math.round(28 * s) + i * rowH;
      const isMe     = p.id === SocketClient.myPlayerId;
      const isLeader = auction && auction.currentBidder === p.id;

      const rG = this.add.graphics();
      rG.fillStyle(isLeader ? 0x1a3010 : (isMe ? 0x0d2010 : 0x0a1c0c), 1);
      rG.fillRoundedRect(listX + Math.round(6 * s), ry, listW - Math.round(12 * s), rowH - Math.round(4 * s), 6);
      if (isLeader || isMe) {
        rG.lineStyle(1, isLeader ? 0xffd600 : 0x00c853, 1);
        rG.strokeRoundedRect(listX + Math.round(6 * s), ry, listW - Math.round(12 * s), rowH - Math.round(4 * s), 6);
      }
      this.objects.push(rG);

      const icon = p.isBot ? '🤖' : (isMe ? '●' : '○');
      this.objects.push(this.add.text(listX + Math.round(12 * s), ry + Math.round(5 * s),
        `${icon} ${p.name}`, {
          fontSize: fs(11), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
          color: isLeader ? '#ffd600' : (isMe ? '#00e676' : '#ffffff'),
        }));
      this.objects.push(this.add.text(listX + Math.round(12 * s), ry + Math.round(22 * s),
        `💰 ${p.budget}M  📋 ${p.rosterSize}`, {
          fontSize: fs(9), fontFamily: 'Rajdhani, Arial', color: '#3a6a3a',
        }));
    });
  }

  _drawBidBar(auction, y, W, barH, s) {
    const fs       = n => `${Math.round(n * s)}px`;
    const myBudget = SocketClient.privateState?.budget ?? 0;
    const curBid   = auction.currentBid;

    const bgG = this.add.graphics();
    bgG.fillStyle(0x061008, 0.95);
    bgG.fillRect(0, y, W, barH);
    bgG.fillStyle(0x1e3a24, 1);
    bgG.fillRect(0, y, W, 1);
    this.objects.push(bgG);

    const isLeading = auction.currentBidder === SocketClient.myPlayerId;
    this.objects.push(this.add.text(Math.round(20 * s), y + Math.round(14 * s),
      `💰  Budget: ${myBudget}M`, {
        fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ffd600',
      }));
    if (isLeading) {
      this.objects.push(this.add.text(Math.round(20 * s), y + Math.round(34 * s),
        '🏆 Du führst!', { fontSize: fs(10), fontFamily: 'Rajdhani, Arial', color: '#00e676' }));
    }

    const increments    = [1, 2, 5, 10, 20, 50];
    const btnH          = Math.round(48 * s);
    const btnW          = Math.round(128 * s);
    const gap           = Math.round(8 * s);
    const totalBtnW     = increments.length * btnW + (increments.length - 1) * gap;
    const startX        = (W - totalBtnW) / 2;
    const btnY          = y + (barH - btnH) / 2;

    increments.forEach((inc, i) => {
      const newBid    = curBid + inc;
      const canAfford = myBudget >= newBid;
      const bx        = startX + i * (btnW + gap);
      const col       = canAfford ? 0x00c853 : 0x1a3a1a;
      const textCol   = canAfford ? '#000000' : '#2a4a2a';

      const bG = this.add.graphics();
      bG.fillStyle(col, 1);
      bG.fillRoundedRect(bx, btnY, btnW, btnH, 8);
      this.objects.push(bG);

      this.objects.push(this.add.text(bx + btnW / 2, btnY + btnH / 2,
        `+${inc}M → ${newBid}M`, {
          fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: textCol,
        }).setOrigin(0.5));

      if (canAfford) {
        const zone = this.add.zone(bx, btnY, btnW, btnH).setOrigin(0).setInteractive({ cursor: 'pointer' });
        zone.on('pointerover',  () => { bG.clear(); bG.fillStyle(0x00e676, 1); bG.fillRoundedRect(bx, btnY, btnW, btnH, 8); });
        zone.on('pointerout',   () => { bG.clear(); bG.fillStyle(col,    1); bG.fillRoundedRect(bx, btnY, btnW, btnH, 8); });
        zone.on('pointerdown',  () => SocketClient.emit('raise_bid', { amount: newBid }));
        this.objects.push(zone);
      }
    });
  }

  _drawHostControls(s) {
    if (!SocketClient.isHost) return;
    const W  = this.scale.width;
    const H  = this.scale.height;
    const fs = n => `${Math.round(n * s)}px`;
    const btnH = Math.round(28 * s);
    const btnY = H - Math.round(14 * s) - btnH;

    const sW = Math.round(90 * s);
    const sX = W - Math.round(264 * s);
    const sG = this.add.graphics();
    sG.fillStyle(0x1a3a1a, 1);
    sG.fillRoundedRect(sX, btnY, sW, btnH, 5);
    this.objects.push(sG);
    this.objects.push(this.add.text(sX + sW / 2, btnY + btnH / 2, '⏭ Skip', {
      fontSize: fs(10), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#5a8a5a',
    }).setOrigin(0.5));
    const sZ = this.add.zone(sX, btnY, sW, btnH).setOrigin(0).setInteractive({ cursor: 'pointer' });
    sZ.on('pointerdown', () => SocketClient.emit('skip_auction'));
    this.objects.push(sZ);

    const eW = Math.round(160 * s);
    const eX = W - Math.round(164 * s);
    const eG = this.add.graphics();
    eG.fillStyle(0x5a1a1a, 1);
    eG.fillRoundedRect(eX, btnY, eW, btnH, 5);
    this.objects.push(eG);
    this.objects.push(this.add.text(eX + eW / 2, btnY + btnH / 2, '⏩ Auktion beenden', {
      fontSize: fs(10), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ff5252',
    }).setOrigin(0.5));
    const eZ = this.add.zone(eX, btnY, eW, btnH).setOrigin(0).setInteractive({ cursor: 'pointer' });
    eZ.on('pointerdown', () => SocketClient.emit('end_auction_phase'));
    this.objects.push(eZ);
  }

  _showResult(r) {
    this.objects.forEach(o => { try { o?.destroy(); } catch (_) {} });
    this.objects   = [];
    this._timerTxt = null;
    this._timerFg  = null;

    const W  = this.scale.width;
    const H  = this.scale.height;
    const s  = Math.min(W / 1280, H / 720);
    const CX = W / 2;
    const CY = H / 2;
    const fs = n => `${Math.round(n * s)}px`;

    // Stadium bg with heavy overlay for modal effect
    addStadiumBg(this, this.objects, W, H, 0.92);

    const pw = Math.round(480 * s);
    const ph = Math.round(240 * s);
    const px = CX - pw / 2;
    const py = CY - ph / 2;

    const won    = r.winnerId !== null;
    const isMe   = r.winnerId === SocketClient.myPlayerId;
    const accent = won ? (isMe ? 0xffd600 : 0x00c853) : 0x3a3a3a;

    const gfx = this.add.graphics();
    // Glow for result card
    for (let i = 6; i >= 1; i--) {
      const sh = i * Math.round(2 * s);
      gfx.fillStyle(accent, 0.025 * i);
      gfx.fillRoundedRect(px - sh, py - sh, pw + sh * 2, ph + sh * 2, 16 + sh);
    }
    gfx.fillStyle(0x060e14, 0.97);
    gfx.fillRoundedRect(px, py, pw, ph, 16);
    gfx.fillStyle(accent, 0.45);
    gfx.fillRoundedRect(px, py, pw, Math.round(ph * 0.28), 16);
    gfx.lineStyle(3, accent, 1);
    gfx.strokeRoundedRect(px, py, pw, ph, 16);
    this.objects.push(gfx);

    if (won) {
      const winner = SocketClient.publicState?.players?.[r.winnerId];
      this.objects.push(this.add.text(CX, py + Math.round(36 * s),
        isMe ? '🎉  ZUSCHLAG — DU HAST GEWONNEN!' : '🏆  ZUSCHLAG!', {
          fontSize: fs(19), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold',
          color: isMe ? '#ffd600' : '#00e676',
        }).setOrigin(0.5));
      this.objects.push(this.add.text(CX, py + Math.round(66 * s),
        `${winner?.name ?? '?'}  erhält  ${r.player.name}  (${r.player.pos})`, {
          fontSize: fs(13), fontFamily: 'Rajdhani, Arial', color: '#cccccc',
        }).setOrigin(0.5));
      this.objects.push(this.add.text(CX, py + Math.round(148 * s), `${r.amount}M`, {
        fontSize: fs(50), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#ffd600',
      }).setOrigin(0.5));
    } else {
      this.objects.push(this.add.text(CX, py + ph / 2 - Math.round(10 * s),
        '🚫  Kein Gebot — Spieler bleibt im Pool', {
          fontSize: fs(17), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#5a8a5a',
        }).setOrigin(0.5));
    }
    this.objects.push(this.add.text(CX, py + ph - Math.round(18 * s),
      'Nächste Auktion startet gleich…', {
        fontSize: fs(10), fontFamily: 'Rajdhani, Arial', color: '#3a5a3a',
      }).setOrigin(0.5));
  }

  _timerColor(t) {
    if (t > 10) return '#00e676';
    if (t >  5) return '#ffd600';
    return '#ff5252';
  }

  _drawTimerBar(x, y, w, h, timeLeft, col) {
    this._timerFg.clear();
    const ratio = Math.max(0, timeLeft / 20);
    this._timerFg.fillStyle(parseInt(col.replace('#', ''), 16), 1);
    this._timerFg.fillRoundedRect(x, y, w * ratio, h, 3);
  }

  _tickTimer(timeLeft) {
    if (this.showingResult) return;
    const col = this._timerColor(timeLeft);
    if (this._timerTxt && !this._timerTxt.destroyed) {
      this._timerTxt.setText(String(timeLeft)).setColor(col);
      if (timeLeft <= 5 && timeLeft > 0) {
        this.tweens.add({ targets: this._timerTxt, scaleX: 1.12, scaleY: 1.12, duration: 100, yoyo: true });
      }
    }
    if (this._timerFg && !this._timerFg.destroyed && this._timerMeta) {
      const { x, y, w, h } = this._timerMeta;
      this._drawTimerBar(x, y, w, h, timeLeft, col);
    }
  }

  _onShutdown() {
    this.scale.off('resize', this.redraw, this);
    this.unsubs.forEach(u => u?.());
    this.objects.forEach(o => { try { o?.destroy(); } catch (_) {} });
  }

  shutdown() { this._onShutdown(); }
}
