import { SocketClient }                 from '../network/SocketClient.js';
import { addStadiumBg, preloadStadium } from '../ui/SceneBackground.js';

export class TableScene extends Phaser.Scene {
  constructor() { super('TableScene'); }

  preload() { preloadStadium(this); }

  create() {
    this.objects = [];
    this.unsubs  = [];
    this.tab     = 'table';

    this.unsubs.push(SocketClient.on('phase_changed', ({ phase }) => {
      if (phase === 'transfer') this.scene.start('TransferScene');
      if (phase === 'prep')     this.scene.start('MatchdayPrepScene');
      if (phase === 'winner')   this.scene.start('WinnerScene');
    }));

    this.scale.on('resize', () => this.redraw(), this);
    this.events.on('shutdown', () => this._onShutdown(), this);
    this.redraw();
  }

  // ── Full redraw ────────────────────────────────────────────────────────────
  redraw() {
    this.objects.forEach(o => { try { o?.destroy(); } catch (_) {} });
    this.objects = [];

    const W  = this.scale.width, H = this.scale.height;
    const s  = Math.min(W / 1280, H / 720);
    const CX = W / 2;
    const fs = n => `${Math.round(n * s)}px`;

    const pub = SocketClient.publicState;
    const md  = pub?.currentMatchday ?? 0;

    // ── Background: stadium + overlay ────────────────────────────────────
    addStadiumBg(this, this.objects, W, H);

    // ── Top bar ───────────────────────────────────────────────────────────
    const barH = Math.round(52 * s);
    const topG = this.add.graphics();
    topG.fillStyle(0x061008, 0.92); topG.fillRect(0, 0, W, barH);
    topG.fillStyle(0xffd600, 1);    topG.fillRect(0, barH - 2, W, 2);
    this.objects.push(topG);
    this.objects.push(this.add.text(CX, barH / 2,
      `📊  TABELLE  —  NACH SPIELTAG ${md}`, {
        fontSize: fs(20), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#fff',
      }).setOrigin(0.5));

    // ── Tab bar ───────────────────────────────────────────────────────────
    const tabH  = Math.round(38 * s);
    const tabY  = barH + Math.round(6 * s);
    const tabs  = [
      { id: 'table',   label: '📊  Tabelle'     },
      { id: 'results', label: '⚽  Ergebnisse'  },
      { id: 'scorers', label: '🏆  Torschützen' },
    ];
    const tabW   = Math.round(200 * s);
    const tabGap = Math.round(6 * s);
    const tabsX  = CX - (tabs.length * tabW + (tabs.length - 1) * tabGap) / 2;

    tabs.forEach((t, i) => {
      const tx     = tabsX + i * (tabW + tabGap);
      const active = this.tab === t.id;
      const tG     = this.add.graphics();
      tG.fillStyle(active ? 0x00152a : 0x060e14, active ? 1 : 0.85);
      tG.fillRoundedRect(tx, tabY, tabW, tabH, 8);
      if (active) { tG.lineStyle(1.5, 0x2979ff, 1); tG.strokeRoundedRect(tx, tabY, tabW, tabH, 8); }
      else        { tG.lineStyle(1, 0x1a3a6a, 0.5); tG.strokeRoundedRect(tx, tabY, tabW, tabH, 8); }
      this.objects.push(tG);
      this.objects.push(this.add.text(tx + tabW / 2, tabY + tabH / 2, t.label, {
        fontSize: fs(11), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
        color: active ? '#82b1ff' : '#2a4a8a',
      }).setOrigin(0.5));
      if (!active) {
        const z = this.add.zone(tx, tabY, tabW, tabH).setOrigin(0).setInteractive({ cursor: 'pointer' });
        z.on('pointerdown', () => { this.tab = t.id; this.redraw(); });
        this.objects.push(z);
      }
    });

    const contentY = tabY + tabH + Math.round(8 * s);
    const contentH = H - contentY - Math.round(64 * s);

    if (this.tab === 'table')   this._drawTable(pub, Math.round(16 * s), contentY, W - Math.round(32 * s), contentH, s);
    if (this.tab === 'results') this._drawResults(pub, Math.round(16 * s), contentY, W - Math.round(32 * s), contentH, s);
    if (this.tab === 'scorers') this._drawScorers(pub, Math.round(16 * s), contentY, W - Math.round(32 * s), contentH, s);

    this._drawBottom(W, H, s, pub);
  }

  // ── Tabelle ────────────────────────────────────────────────────────────────
  _drawTable(pub, x, y, w, h, s) {
    const fs        = n => `${Math.round(n * s)}px`;
    const standings = pub?.standings ?? [];
    const myId      = SocketClient.myPlayerId;

    const headerH = Math.round(28 * s);
    const hG = this.add.graphics();
    hG.fillStyle(0x060e14, 0.92);
    hG.fillRoundedRect(x, y, w, headerH, { tl: 10, tr: 10, bl: 0, br: 0 });
    hG.lineStyle(1, 0x1a3a6a, 0.5);
    hG.strokeRoundedRect(x, y, w, headerH, { tl: 10, tr: 10, bl: 0, br: 0 });
    this.objects.push(hG);

    const cols = [
      { label: '#',        w: 0.04 },
      { label: 'Manager',  w: 0.30 },
      { label: 'Sp',       w: 0.07 },
      { label: 'S',        w: 0.07 },
      { label: 'U',        w: 0.07 },
      { label: 'N',        w: 0.07 },
      { label: 'Tore',     w: 0.10 },
      { label: 'Diff',     w: 0.10 },
      { label: 'Punkte',   w: 0.18 },
    ];
    let cx = x + Math.round(8 * s);
    cols.forEach(col => {
      const cw = Math.round(w * col.w);
      this.objects.push(this.add.text(cx + cw / 2, y + headerH / 2, col.label, {
        fontSize: fs(10), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#5a8aaa',
      }).setOrigin(0.5));
      cx += cw;
    });

    const rowH = Math.round(Math.min(56 * s, (h - headerH - Math.round(4 * s)) / Math.max(standings.length, 1)));
    const medals = ['🥇', '🥈', '🥉'];

    standings.forEach((p, rank) => {
      const ry     = y + headerH + Math.round(3 * s) + rank * rowH;
      if (ry + rowH > y + h) return;
      const isMe   = p.id === myId;
      const isFirst = rank === 0;
      const isLast  = rank === standings.length - 1;
      const gd     = p.goalsFor - p.goalsAgainst;
      const played = p.wins + p.draws + p.losses;

      const rG = this.add.graphics();
      const rCol = isFirst ? 0x0a2010 : isLast ? 0x1a0a08 : 0x060e14;
      rG.fillStyle(rCol, 0.92);
      rG.fillRoundedRect(x, ry, w, rowH - Math.round(2 * s), 6);
      if (isMe) { rG.lineStyle(1.5, 0x00c853, 1); rG.strokeRoundedRect(x, ry, w, rowH - Math.round(2 * s), 6); }
      this.objects.push(rG);

      const cHex = parseInt((p.colorHex ?? '#ffffff').replace('#', ''), 16);
      const cbG = this.add.graphics();
      cbG.fillStyle(cHex, 1);
      cbG.fillRect(x + Math.round(3 * s), ry + Math.round(4 * s), Math.round(3 * s), rowH - Math.round(10 * s));
      this.objects.push(cbG);

      let cx2 = x + Math.round(8 * s);

      const rankW = Math.round(w * 0.04);
      this.objects.push(this.add.text(cx2 + rankW / 2, ry + rowH / 2,
        medals[rank] ?? `${rank + 1}`, {
          fontSize: fs(rank < 3 ? 16 : 12), fontFamily: 'Oswald, Arial',
        }).setOrigin(0.5));
      cx2 += rankW;

      const nameW = Math.round(w * 0.30);
      this.objects.push(this.add.text(cx2 + Math.round(6 * s), ry + Math.round(rowH * 0.28), p.name, {
        fontSize: fs(13), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
        color: isMe ? '#00e676' : (p.colorHex ?? '#fff'),
      }));
      this.objects.push(this.add.text(cx2 + Math.round(6 * s), ry + Math.round(rowH * 0.65), p.clubName ?? '', {
        fontSize: fs(9), fontFamily: 'Rajdhani, Arial', color: '#3a6a3a',
      }));
      cx2 += nameW;

      const statCols = [
        { val: played,  col: '#bbb',    w: 0.07 },
        { val: p.wins,  col: '#00e676', w: 0.07 },
        { val: p.draws, col: '#ffd600', w: 0.07 },
        { val: p.losses,col: '#ff5252', w: 0.07 },
        { val: `${p.goalsFor}:${p.goalsAgainst}`, col: '#bbb', w: 0.10 },
        { val: (gd >= 0 ? '+' : '') + gd, col: gd >= 0 ? '#00c853' : '#ff5252', w: 0.10 },
      ];
      statCols.forEach(sc => {
        const cw = Math.round(w * sc.w);
        this.objects.push(this.add.text(cx2 + cw / 2, ry + rowH / 2, String(sc.val), {
          fontSize: fs(13), fontFamily: 'Oswald, Arial', color: sc.col,
        }).setOrigin(0.5));
        cx2 += cw;
      });

      const ptW = Math.round(w * 0.18);
      this.objects.push(this.add.text(cx2 + ptW / 2, ry + rowH / 2, `${p.points}`, {
        fontSize: fs(22), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#ffd600',
      }).setOrigin(0.5));
    });
  }

  // ── Ergebnisse ─────────────────────────────────────────────────────────────
  _drawResults(pub, x, y, w, h, s) {
    const fs   = n => `${Math.round(n * s)}px`;
    const myId = SocketClient.myPlayerId;
    const all  = [...(pub?.matchResults ?? [])].reverse().slice(0, 16);
    const cols = 2;
    const gap  = Math.round(8 * s);
    const cardW = Math.round((w - gap) / cols);
    const cardH = Math.round(88 * s);

    all.forEach((r, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx  = x + col * (cardW + gap);
      const cy  = y + row * (cardH + gap);
      if (cy + cardH > y + h) return;

      const isMyGame = r.homeId === myId || r.awayId === myId;
      const g = this.add.graphics();
      g.fillStyle(isMyGame ? 0x0a1e10 : 0x060e14, 0.92);
      g.fillRoundedRect(cx, cy, cardW, cardH, 10);
      g.lineStyle(1, isMyGame ? 0x00c853 : 0x1e3a24, 1);
      g.strokeRoundedRect(cx, cy, cardW, cardH, 10);
      this.objects.push(g);

      this.objects.push(this.add.text(cx + cardW / 2, cy + Math.round(10 * s),
        `Spieltag ${r.matchday}`, {
          fontSize: fs(9), fontFamily: 'Oswald, Arial', color: '#3a6a3a',
        }).setOrigin(0.5));
      this.objects.push(this.add.text(cx + Math.round(12 * s), cy + Math.round(28 * s),
        r.homeName, { fontSize: fs(13), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ddd' }));
      this.objects.push(this.add.text(cx + cardW - Math.round(12 * s), cy + Math.round(28 * s),
        r.awayName, { fontSize: fs(13), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ddd' })
        .setOrigin(1, 0));
      this.objects.push(this.add.text(cx + cardW / 2, cy + Math.round(cardH * 0.44),
        `${r.homeGoals}  :  ${r.awayGoals}`, {
          fontSize: fs(22), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#ffd600',
        }).setOrigin(0.5));

      const goals = (r.events ?? []).filter(e => e.type === 'goal').map(e => e.playerName).join('  ·  ');
      if (goals) this.objects.push(this.add.text(cx + cardW / 2, cy + Math.round(cardH * 0.80),
        `⚽  ${goals}`, {
          fontSize: fs(9), fontFamily: 'Rajdhani, Arial', color: '#5a7a5a',
          wordWrap: { width: cardW - Math.round(20 * s) },
        }).setOrigin(0.5));
    });
  }

  // ── Torschützen ────────────────────────────────────────────────────────────
  _drawScorers(pub, x, y, w, h, s) {
    const fs = n => `${Math.round(n * s)}px`;
    const myId = SocketClient.myPlayerId;
    const players = [...(pub?.standings ?? [])]
      .sort((a, b) => (b.seasonGoals ?? 0) - (a.seasonGoals ?? 0));
    const rowH = Math.round(52 * s);
    const medals = ['🥇', '🥈', '🥉'];

    players.forEach((p, i) => {
      const ry   = y + i * (rowH + Math.round(4 * s));
      if (ry + rowH > y + h) return;
      const isMe = p.id === myId;

      const g = this.add.graphics();
      g.fillStyle(isMe ? 0x0a2010 : 0x060e14, 0.92);
      g.fillRoundedRect(x, ry, w, rowH, 10);
      if (isMe) { g.lineStyle(1.5, 0x00c853, 1); g.strokeRoundedRect(x, ry, w, rowH, 10); }
      else       { g.lineStyle(1, 0x1e3a24, 0.5); g.strokeRoundedRect(x, ry, w, rowH, 10); }
      this.objects.push(g);

      const cHex = parseInt((p.colorHex ?? '#ffffff').replace('#', ''), 16);
      const cg = this.add.graphics();
      cg.fillStyle(cHex, 1);
      cg.fillRect(x + Math.round(3 * s), ry + Math.round(4 * s), Math.round(3 * s), rowH - Math.round(8 * s));
      this.objects.push(cg);

      this.objects.push(this.add.text(x + Math.round(14 * s), ry + rowH / 2,
        medals[i] ?? `${i + 1}.`, { fontSize: fs(i < 3 ? 18 : 13), fontFamily: 'Oswald, Arial' })
        .setOrigin(0, 0.5));
      this.objects.push(this.add.text(x + Math.round(50 * s), ry + Math.round(rowH * 0.28), p.name, {
        fontSize: fs(14), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
        color: isMe ? '#00e676' : (p.colorHex ?? '#fff'),
      }));
      this.objects.push(this.add.text(x + Math.round(50 * s), ry + Math.round(rowH * 0.65), p.clubName ?? '', {
        fontSize: fs(9), fontFamily: 'Rajdhani, Arial', color: '#3a6a3a',
      }));

      const maxGoals = players[0]?.seasonGoals ?? 1;
      const barW     = Math.round(w * 0.35);
      const barX     = x + Math.round(w * 0.52);
      const barH2    = Math.round(8 * s);
      const barY2    = ry + rowH / 2 - barH2 / 2;
      const barG = this.add.graphics();
      barG.fillStyle(0x000000, 0.4); barG.fillRoundedRect(barX, barY2, barW, barH2, 4);
      if (maxGoals > 0) {
        barG.fillStyle(p.id === myId ? 0x00c853 : 0x2a6a2a, 1);
        barG.fillRoundedRect(barX, barY2, barW * ((p.seasonGoals ?? 0) / maxGoals), barH2, 4);
      }
      this.objects.push(barG);

      this.objects.push(this.add.text(x + w - Math.round(12 * s), ry + rowH / 2,
        `⚽  ${p.seasonGoals ?? 0}  Tore`, {
          fontSize: fs(14), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ffd600',
        }).setOrigin(1, 0.5));
    });
  }

  // ── Bottom nav ─────────────────────────────────────────────────────────────
  _drawBottom(W, H, s, pub) {
    const fs    = n => `${Math.round(n * s)}px`;
    const phase = pub?.phase ?? '';
    const md    = pub?.currentMatchday ?? 0;
    const total = pub?.totalMatchdays ?? 8;
    const isLast = md >= total;

    const barH = Math.round(56 * s);
    const barY = H - barH;
    const bg = this.add.graphics();
    bg.fillStyle(0x061008, 0.97); bg.fillRect(0, barY, W, barH);
    bg.fillStyle(0x1e3a24, 1);   bg.fillRect(0, barY, W, 1);
    this.objects.push(bg);

    const mkBtn = (cx, label, color, textCol, onClick) => {
      const bW = Math.round(240 * s), bH = Math.round(40 * s);
      const bX = cx - bW / 2, bY2 = barY + (barH - bH) / 2;
      const g  = this.add.graphics();
      g.fillStyle(color, 1); g.fillRoundedRect(bX, bY2, bW, bH, 8);
      this.objects.push(g);
      this.objects.push(this.add.text(cx, bY2 + bH / 2, label, {
        fontSize: fs(13), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: textCol,
      }).setOrigin(0.5));
      const z = this.add.zone(bX, bY2, bW, bH).setOrigin(0).setInteractive({ cursor: 'pointer' });
      z.on('pointerover', () => { g.clear(); g.fillStyle(color, 0.75); g.fillRoundedRect(bX, bY2, bW, bH, 8); });
      z.on('pointerout',  () => { g.clear(); g.fillStyle(color, 1);    g.fillRoundedRect(bX, bY2, bW, bH, 8); });
      z.on('pointerdown', onClick);
      this.objects.push(z);
    };

    if (isLast) {
      mkBtn(W / 2, '🏆  SIEGER ERMITTELN', 0xffd600, '#000', () => this.scene.start('WinnerScene'));
      return;
    }

    if (phase === 'transfer') {
      mkBtn(W / 2 - Math.round(130 * s), '🔄  Transferfenster', 0x2979ff, '#fff', () => this.scene.start('TransferScene'));
      mkBtn(W / 2 + Math.round(130 * s), `⚽  Spieltag ${md + 1}`, 0x00c853, '#000', () => this.scene.start('MatchdayPrepScene'));
    } else {
      mkBtn(W / 2, `⚽  SPIELTAG ${md + 1} VORBEREITEN`, 0x00c853, '#000', () => this.scene.start('MatchdayPrepScene'));
    }
  }

  _onShutdown() {
    this.scale.off('resize', this.redraw, this);
    this.unsubs.forEach(u => u?.());
    this.objects.forEach(o => { try { o?.destroy(); } catch (_) {} });
  }

  shutdown() { this._onShutdown(); }
}
