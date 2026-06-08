import { SocketClient }                 from '../network/SocketClient.js';
import { addStadiumBg, preloadStadium } from '../ui/SceneBackground.js';

export class WinnerScene extends Phaser.Scene {
  constructor() { super('WinnerScene'); }

  preload() { preloadStadium(this); }

  create() {
    this.objects = [];
    this._confettiTimer = null;

    this.scale.on('resize', () => this.redraw(), this);
    this.events.on('shutdown', () => this._onShutdown(), this);
    this.redraw();
  }

  redraw() {
    if (this._confettiTimer) { this._confettiTimer.remove(); this._confettiTimer = null; }
    this.objects.forEach(o => { try { o?.destroy(); } catch (_) {} });
    this.objects = [];

    const W  = this.scale.width, H = this.scale.height;
    const s  = Math.min(W / 1280, H / 720);
    const CX = W / 2;
    const fs = n => `${Math.round(n * s)}px`;

    const pub       = SocketClient.publicState;
    const standings = pub?.standings ?? [];
    const winner    = standings[0];
    const myId      = SocketClient.myPlayerId;

    // ── Background: stadium + overlay ────────────────────────────────────
    addStadiumBg(this, this.objects, W, H);

    // ── Confetti ──────────────────────────────────────────────────────────
    this._spawnConfetti(W, H);

    // ── Top winner banner ─────────────────────────────────────────────────
    const bannerH = Math.round(80 * s);
    const bannerW = Math.round(700 * s);
    const bannerX = CX - bannerW / 2;
    const bannerY = Math.round(16 * s);

    const bannerG = this.add.graphics();
    // Gold glow
    for (let i = 6; i >= 1; i--) {
      const sh = i * Math.round(2 * s);
      bannerG.fillStyle(0xffd600, 0.022 * i);
      bannerG.fillRoundedRect(bannerX - sh, bannerY - sh, bannerW + sh * 2, bannerH + sh * 2, 16 + sh);
    }
    bannerG.fillStyle(0x060e14, 0.97);
    bannerG.fillRoundedRect(bannerX, bannerY, bannerW, bannerH, 16);
    bannerG.fillStyle(0x00c853, 0.45);
    bannerG.fillRoundedRect(bannerX, bannerY, bannerW, Math.round(bannerH * 0.38), 16);
    bannerG.lineStyle(3, 0x00c853, 1);
    bannerG.strokeRoundedRect(bannerX, bannerY, bannerW, bannerH, 16);
    this.objects.push(bannerG);

    this.objects.push(this.add.text(CX, bannerY + Math.round(22 * s), '🏆', {
      fontSize: fs(28),
    }).setOrigin(0.5));
    this.objects.push(this.add.text(CX, bannerY + Math.round(57 * s),
      `SAISONSIEGER:  ${(winner?.name ?? '?').toUpperCase()}`, {
        fontSize: fs(22), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#fff',
      }).setOrigin(0.5));

    // ── Layout columns ────────────────────────────────────────────────────
    const contentY  = bannerY + bannerH + Math.round(12 * s);
    const botBarH   = Math.round(64 * s);
    const contentH  = H - contentY - botBarH - Math.round(8 * s);
    const gap       = Math.round(10 * s);
    const leftW     = Math.round(300 * s);
    const rightW    = Math.round(280 * s);
    const centerW   = W - leftW - rightW - gap * 4;
    const leftX     = gap;
    const centerX   = leftX + leftW + gap;
    const rightX    = centerX + centerW + gap;

    this._drawTable(leftX, contentY, leftW, contentH, s, standings, myId);
    this._drawPodium(centerX, contentY, centerW, contentH, s, standings);
    this._drawAwards(rightX, contentY, rightW, contentH, s, pub, standings);
    this._drawBottom(W, H, botBarH, s, standings, myId);
  }

  // ── Final standings table ──────────────────────────────────────────────────
  _drawTable(x, y, w, h, s, standings, myId) {
    const fs = n => `${Math.round(n * s)}px`;

    const g = this.add.graphics();
    // Glow
    for (let i = 5; i >= 1; i--) {
      const sh = i * Math.round(2 * s);
      g.fillStyle(0x00c853, 0.016 * i);
      g.fillRoundedRect(x - sh, y - sh, w + sh * 2, h + sh * 2, 16 + sh);
    }
    g.fillStyle(0x060e14, 0.92);
    g.fillRoundedRect(x, y, w, h, 14);
    g.fillStyle(0x00c853, 0.20);
    g.fillRoundedRect(x, y, w, Math.round(h * 0.06), 14);
    g.lineStyle(1, 0x1e5a2a, 1);
    g.strokeRoundedRect(x, y, w, h, 14);
    this.objects.push(g);

    this.objects.push(this.add.text(x + w / 2, y + Math.round(14 * s),
      'ABSCHLUSSTABELLE', {
        fontSize: fs(11), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#2a7a3a',
      }).setOrigin(0.5));

    const medals  = ['🥇', '🥈', '🥉'];
    const rowH    = Math.round(Math.min(46 * s, (h - Math.round(32 * s)) / Math.max(standings.length, 1)));
    const startY  = y + Math.round(32 * s);

    standings.forEach((p, i) => {
      const ry   = startY + i * rowH;
      if (ry + rowH > y + h - Math.round(4 * s)) return;
      const isMe = p.id === myId;
      const gd   = p.goalsFor - p.goalsAgainst;

      const rg = this.add.graphics();
      rg.fillStyle(isMe ? 0x0a2a10 : (i === 0 ? 0x0d2a0d : 0x0a1208), 1);
      rg.fillRoundedRect(x + Math.round(5 * s), ry + Math.round(2 * s),
        w - Math.round(10 * s), rowH - Math.round(4 * s), 6);
      if (isMe) {
        rg.lineStyle(1.5, 0x00c853, 1);
        rg.strokeRoundedRect(x + Math.round(5 * s), ry + Math.round(2 * s),
          w - Math.round(10 * s), rowH - Math.round(4 * s), 6);
      }
      this.objects.push(rg);

      const cHex = parseInt((p.colorHex ?? '#ffffff').replace('#', ''), 16);
      const cg = this.add.graphics();
      cg.fillStyle(cHex, 1);
      cg.fillRect(x + Math.round(9 * s), ry + Math.round(7 * s), Math.round(3 * s), rowH - Math.round(14 * s));
      this.objects.push(cg);

      this.objects.push(this.add.text(x + Math.round(17 * s), ry + rowH / 2,
        medals[i] ?? `${i + 1}.`, { fontSize: fs(i < 3 ? 15 : 11), fontFamily: 'Oswald, Arial' })
        .setOrigin(0, 0.5));
      this.objects.push(this.add.text(x + Math.round(42 * s), ry + Math.round(rowH * 0.28), p.name, {
        fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
        color: isMe ? '#00e676' : (i === 0 ? '#ffd600' : (p.colorHex ?? '#ddd')),
      }));
      this.objects.push(this.add.text(x + Math.round(42 * s), ry + Math.round(rowH * 0.68),
        `${p.wins}S ${p.draws}U ${p.losses}N  ·  ${p.goalsFor}:${p.goalsAgainst}`, {
          fontSize: fs(8), fontFamily: 'Rajdhani, Arial', color: '#3a6a3a',
        }));

      this.objects.push(this.add.text(x + w - Math.round(10 * s), ry + rowH / 2,
        `${p.points}P`, {
          fontSize: fs(14), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
          color: i === 0 ? '#ffd600' : '#aaa',
        }).setOrigin(1, 0.5));
    });
  }

  // ── Podium ─────────────────────────────────────────────────────────────────
  _drawPodium(x, y, w, h, s, standings) {
    const fs  = n => `${Math.round(n * s)}px`;
    const top = standings.slice(0, 3);
    const CX2 = x + w / 2;

    const baseY   = y + Math.round(h * 0.78);
    const podW    = Math.round(w * 0.28);
    const maxPodH = Math.round(h * 0.32);

    const podiums = [
      { rank: 1, xOff: -Math.round(w * 0.30), podH: Math.round(maxPodH * 0.72), medal: '🥈', col: 0x7f8c8d },
      { rank: 0, xOff:  0,                     podH: maxPodH,                    medal: '🥇', col: 0xf1c40f },
      { rank: 2, xOff:  Math.round(w * 0.30),  podH: Math.round(maxPodH * 0.52), medal: '🥉', col: 0xcd6133 },
    ];

    podiums.forEach(({ rank, xOff, podH, medal, col }) => {
      const p = top[rank];
      if (!p) return;
      const px   = CX2 + xOff;
      const podY = baseY - podH;

      const pg = this.add.graphics();
      pg.fillStyle(col === 0xf1c40f ? 0x2a2000 : col === 0x7f8c8d ? 0x1a1a2a : 0x2a1400, 1);
      pg.fillRoundedRect(px - podW / 2, podY, podW, podH, { tl: 8, tr: 8, bl: 0, br: 0 });
      pg.lineStyle(2, col, 0.8);
      pg.strokeRoundedRect(px - podW / 2, podY, podW, podH, { tl: 8, tr: 8, bl: 0, br: 0 });
      pg.fillStyle(col, 1);
      pg.fillRect(px - podW / 2 + 2, podY + 2, podW - 4, Math.round(4 * s));
      this.objects.push(pg);

      // Points inside block
      this.objects.push(this.add.text(px, podY + podH / 2, `${p.points} Pkt`, {
        fontSize: fs(rank === 0 ? 22 : 17), fontFamily: 'Oswald, Arial Black',
        fontStyle: 'bold', color: `#${col.toString(16).padStart(6, '0')}`,
      }).setOrigin(0.5));

      // Stats chip above block
      const statY   = podY - Math.round(6 * s);
      const statStr = `${p.wins}S  ${p.draws}U  ${p.losses}N   ⚽ ${p.goalsFor}:${p.goalsAgainst}`;
      const chipH   = Math.round(18 * s);
      const chipW   = podW - Math.round(8 * s);
      const chipG   = this.add.graphics();
      chipG.fillStyle(0x000000, 0.70);
      chipG.fillRoundedRect(px - chipW / 2, statY - chipH, chipW, chipH, 4);
      this.objects.push(chipG);
      this.objects.push(this.add.text(px, statY - chipH / 2, statStr, {
        fontSize: fs(8), fontFamily: 'Rajdhani, Arial', color: '#5a8a5a',
      }).setOrigin(0.5));

      // Medal + name above chip
      this.objects.push(this.add.text(px, statY - chipH - Math.round(22 * s), medal, {
        fontSize: fs(rank === 0 ? 34 : 26),
      }).setOrigin(0.5));
      const nameCol = p.colorHex ?? '#fff';
      this.objects.push(this.add.text(px, statY - chipH - Math.round(44 * s), p.name, {
        fontSize: fs(rank === 0 ? 14 : 11), fontFamily: 'Oswald, Arial',
        fontStyle: 'bold', color: rank === 0 ? '#ffd600' : nameCol,
      }).setOrigin(0.5));
    });

    // Base platform
    const platG = this.add.graphics();
    platG.fillStyle(0x060e14, 0.90);
    platG.fillRoundedRect(x, baseY, w, Math.round(12 * s), { tl: 0, tr: 0, bl: 8, br: 8 });
    platG.lineStyle(1, 0x1e5a2a, 1);
    platG.strokeRoundedRect(x, baseY, w, Math.round(12 * s), { tl: 0, tr: 0, bl: 8, br: 8 });
    this.objects.push(platG);

    // 4th–8th below podium
    const rest  = standings.slice(3);
    const restY = baseY + Math.round(20 * s);
    const restH = Math.round(28 * s);
    const gap2  = Math.round(4 * s);
    rest.forEach((p, i) => {
      const ry = restY + i * (restH + gap2);
      if (ry + restH > y + h) return;
      const rg = this.add.graphics();
      rg.fillStyle(p.id === SocketClient.myPlayerId ? 0x0a2010 : 0x060e14, 0.90);
      rg.fillRoundedRect(x, ry, w, restH, 5);
      if (p.id === SocketClient.myPlayerId) { rg.lineStyle(1, 0x00c853, 1); rg.strokeRoundedRect(x, ry, w, restH, 5); }
      this.objects.push(rg);

      const cHex = parseInt((p.colorHex ?? '#ffffff').replace('#', ''), 16);
      const cg = this.add.graphics();
      cg.fillStyle(cHex, 1);
      cg.fillRect(x + Math.round(3 * s), ry + Math.round(5 * s), Math.round(2 * s), restH - Math.round(10 * s));
      this.objects.push(cg);

      this.objects.push(this.add.text(x + Math.round(10 * s), ry + restH / 2,
        `${i + 4}.  ${p.name}`, {
          fontSize: fs(11), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
          color: p.id === SocketClient.myPlayerId ? '#00e676' : '#aaa',
        }).setOrigin(0, 0.5));
      this.objects.push(this.add.text(x + w - Math.round(8 * s), ry + restH / 2,
        `${p.points}P`, {
          fontSize: fs(11), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#5a7a5a',
        }).setOrigin(1, 0.5));
    });
  }

  // ── Awards panel ───────────────────────────────────────────────────────────
  _drawAwards(x, y, w, h, s, pub, standings) {
    const fs = n => `${Math.round(n * s)}px`;

    const g = this.add.graphics();
    // Gold glow
    for (let i = 5; i >= 1; i--) {
      const sh = i * Math.round(2 * s);
      g.fillStyle(0xffd600, 0.018 * i);
      g.fillRoundedRect(x - sh, y - sh, w + sh * 2, h + sh * 2, 16 + sh);
    }
    g.fillStyle(0x060e14, 0.92);
    g.fillRoundedRect(x, y, w, h, 14);
    g.fillStyle(0xffd600, 0.40);
    g.fillRoundedRect(x, y, w, Math.round(h * 0.07), 14);
    g.lineStyle(1.5, 0x5a4a00, 1);
    g.strokeRoundedRect(x, y, w, h, 14);
    this.objects.push(g);

    this.objects.push(this.add.text(x + w / 2, y + Math.round(16 * s),
      '🏅  AUSZEICHNUNGEN', {
        fontSize: fs(11), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ffd600',
      }).setOrigin(0.5));

    const pl = standings;
    const awards = [
      { icon: '👟', label: 'Torschützenkönig', value: [...pl].sort((a, b) => (b.seasonGoals ?? 0) - (a.seasonGoals ?? 0))[0] },
      { icon: '🛡', label: 'Beste Defensive',  value: [...pl].sort((a, b) => (a.goalsAgainst ?? 0) - (b.goalsAgainst ?? 0))[0] },
      { icon: '🏅', label: 'Meiste Siege',     value: [...pl].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0))[0] },
      { icon: '💰', label: 'Budget-König',     value: [...pl].sort((a, b) => (b.budget ?? 0) - (a.budget ?? 0))[0] },
      { icon: '🤦', label: 'Größter Flop',     value: [...pl].sort((a, b) => ((a.goalsFor - a.goalsAgainst) ?? 0) - ((b.goalsFor - b.goalsAgainst) ?? 0))[0] },
      { icon: '⚽', label: 'Meiste Tore',      value: [...pl].sort((a, b) => (b.goalsFor ?? 0) - (a.goalsFor ?? 0))[0] },
    ];

    const rowH   = Math.round(Math.min(44 * s, (h - Math.round(38 * s)) / awards.length));
    const startY = y + Math.round(34 * s);

    awards.forEach((a, i) => {
      const ry   = startY + i * rowH;
      if (ry + rowH > y + h - Math.round(6 * s)) return;
      const isMe = a.value?.id === SocketClient.myPlayerId;
      const nameCol = isMe ? '#00e676' : (a.value?.colorHex ?? '#fff');

      const rg = this.add.graphics();
      rg.fillStyle(isMe ? 0x0a2010 : 0x0a1208, 1);
      rg.fillRoundedRect(x + Math.round(6 * s), ry, w - Math.round(12 * s), rowH - Math.round(4 * s), 6);
      if (isMe) { rg.lineStyle(1, 0x00c853, 0.6); rg.strokeRoundedRect(x + Math.round(6 * s), ry, w - Math.round(12 * s), rowH - Math.round(4 * s), 6); }
      this.objects.push(rg);

      this.objects.push(this.add.text(x + Math.round(14 * s), ry + rowH * 0.28, `${a.icon}  ${a.label}`, {
        fontSize: fs(9), fontFamily: 'Oswald, Arial', color: '#5a7a5a',
      }));
      this.objects.push(this.add.text(x + Math.round(14 * s), ry + rowH * 0.64, a.value?.name ?? '–', {
        fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: nameCol,
      }));
    });
  }

  // ── Bottom bar ─────────────────────────────────────────────────────────────
  _drawBottom(W, H, barH, s, standings, myId) {
    const fs   = n => `${Math.round(n * s)}px`;
    const barY = H - barH;

    const bg = this.add.graphics();
    bg.fillStyle(0x061008, 0.97); bg.fillRect(0, barY, W, barH);
    bg.fillStyle(0x1e3a24, 1);   bg.fillRect(0, barY, W, 1);
    this.objects.push(bg);

    const myRank = standings.findIndex(p => p.id === myId);
    const me     = standings[myRank];
    if (me) {
      const rankCol = myRank === 0 ? '#ffd600' : myRank <= 2 ? '#aaa' : '#5a8a5a';
      const rankStr = myRank === 0 ? '🥇 Platz 1' : myRank === 1 ? '🥈 Platz 2' : myRank === 2 ? '🥉 Platz 3' : `Platz ${myRank + 1}`;
      this.objects.push(this.add.text(Math.round(20 * s), barY + barH / 2,
        `Du:  ${rankStr}  ·  ${me.points} Punkte  ·  ${me.seasonGoals ?? 0} Tore  ·  ${me.wins}S ${me.draws}U ${me.losses}N`, {
          fontSize: fs(13), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: rankCol,
        }).setOrigin(0, 0.5));
    }

    const bW  = Math.round(220 * s);
    const bH  = Math.round(42 * s);
    const bX  = W - bW - Math.round(20 * s);
    const bY2 = barY + (barH - bH) / 2;
    const bG  = this.add.graphics();
    bG.fillStyle(0x00c853, 1); bG.fillRoundedRect(bX, bY2, bW, bH, 8);
    this.objects.push(bG);
    this.objects.push(this.add.text(bX + bW / 2, bY2 + bH / 2, '🔄  NEUES SPIEL', {
      fontSize: fs(14), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#000',
    }).setOrigin(0.5));
    const z = this.add.zone(bX, bY2, bW, bH).setOrigin(0).setInteractive({ cursor: 'pointer' });
    z.on('pointerover',  () => { bG.clear(); bG.fillStyle(0x00e676, 1); bG.fillRoundedRect(bX, bY2, bW, bH, 8); });
    z.on('pointerout',   () => { bG.clear(); bG.fillStyle(0x00c853, 1); bG.fillRoundedRect(bX, bY2, bW, bH, 8); });
    z.on('pointerdown',  () => this.scene.start('MenuScene'));
    this.objects.push(z);
  }

  // ── Confetti ───────────────────────────────────────────────────────────────
  _spawnConfetti(W, H) {
    const COLORS = [0x00c853, 0xffd600, 0xff5252, 0x2979ff, 0x9c27b0, 0xff9800, 0x00bcd4];
    const COUNT  = 60;
    const pieces = Array.from({ length: COUNT }, () => {
      const g    = this.add.graphics();
      const col  = COLORS[Math.floor(Math.random() * COLORS.length)];
      const size = Math.round(6 + Math.random() * 8);
      const isRect = Math.random() > 0.4;
      g.fillStyle(col, 0.85);
      if (isRect) g.fillRect(0, 0, size, size * 0.6);
      else        g.fillTriangle(0, size, size / 2, 0, size, size);
      g.x   = Math.random() * W;
      g.y   = -20 - Math.random() * H;
      this.objects.push(g);
      return {
        g,
        speed: 1.2 + Math.random() * 2.8,
        drift: (Math.random() - 0.5) * 1.5,
        rot:   (Math.random() - 0.5) * 0.12,
      };
    });

    this._confettiTimer = this.time.addEvent({
      delay: 16, loop: true,
      callback: () => {
        pieces.forEach(({ g, speed, drift, rot }) => {
          g.y += speed; g.x += drift; g.rotation += rot;
          if (g.y > H + 20) { g.y = -20; g.x = Math.random() * W; }
        });
      },
    });
  }

  _onShutdown() {
    if (this._confettiTimer) { this._confettiTimer.remove(); this._confettiTimer = null; }
    this.scale.off('resize', this.redraw, this);
    this.objects.forEach(o => { try { o?.destroy(); } catch (_) {} });
  }

  shutdown() { this._onShutdown(); }
}
