import { SocketClient }                 from '../network/SocketClient.js';
import { addStadiumBg, preloadStadium } from '../ui/SceneBackground.js';

const POS_COL = { GK: 0xf39c12, DEF: 0x27ae60, MID: 0x3498db, FWD: 0xe74c3c };

export class MatchdayPrepScene extends Phaser.Scene {
  constructor() { super('MatchdayPrepScene'); }

  preload() { preloadStadium(this); }

  create() {
    this.objects   = [];
    this.unsubs    = [];
    this.submitted = false;
    this.selCard   = null;
    this.selMgr    = null;
    this.selPlayer = null;
    this.tab       = 'lineup';
    this.localLineup = [...(SocketClient.privateState?.lineup ?? [])];
    this.readyPlayers = new Set();

    this.unsubs.push(SocketClient.on('player_ready', d => {
      if (SocketClient.publicState) {
        SocketClient.publicState.readyCount = d.readyCount;
        SocketClient.publicState.totalCount = d.totalCount;
      }
      if (d.playerName) this.readyPlayers.add(d.playerName);
      this.redraw();
    }));
    this.unsubs.push(SocketClient.on('matchday_results', d => {
      this.scene.start('MatchScene', d);
    }));
    this.unsubs.push(SocketClient.on('private_state', ps => {
      this.localLineup = [...(ps.lineup ?? [])];
      if (!this.submitted) this.redraw();
    }));

    this.scale.on('resize', () => this.redraw(), this);
    this.events.on('shutdown', () => this._onShutdown(), this);
    this.redraw();
  }

  // ── Full redraw ────────────────────────────────────────────────────────────
  redraw() {
    this.objects.forEach(o => { try { o?.destroy(); } catch (_) {} });
    this.objects = [];

    const W  = this.scale.width;
    const H  = this.scale.height;
    const s  = Math.min(W / 1280, H / 720);
    const fs = n => `${Math.round(n * s)}px`;
    const CX = W / 2;

    const pub  = SocketClient.publicState;
    const priv = SocketClient.privateState;
    const me   = SocketClient.me;
    const md   = (pub?.currentMatchday ?? 0) + 1;

    // ── Background: stadium + overlay ────────────────────────────────────
    addStadiumBg(this, this.objects, W, H);

    // ── Top bar ──────────────────────────────────────────────────────────
    const barH = Math.round(52 * s);
    const topG = this.add.graphics();
    topG.fillStyle(0x061008, 0.92);
    topG.fillRect(0, 0, W, barH);
    topG.fillStyle(0xffd600, 1);
    topG.fillRect(0, barH - 2, W, 2);
    this.objects.push(topG);

    this.objects.push(this.add.text(CX, barH / 2,
      `⚽  SPIELTAG ${md}  —  VORBEREITUNG`, {
        fontSize: fs(20), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#fff',
      }).setOrigin(0.5));
    this.objects.push(this.add.text(W - Math.round(16 * s), barH / 2,
      `${me?.name ?? ''}  ·  ${me?.clubName ?? ''}  ·  💰 ${me?.budget ?? '–'}M`, {
        fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ffd600',
      }).setOrigin(1, 0.5));

    if (this.submitted) {
      this._drawWaiting(W, H, barH, s, pub);
      return;
    }

    // ── Layout ───────────────────────────────────────────────────────────
    const botH     = Math.round(64 * s);
    const contentY = barH + Math.round(10 * s);
    const contentH = H - contentY - botH - Math.round(10 * s);
    const gap      = Math.round(10 * s);
    const cardsW   = Math.round(340 * s);
    const rightW   = W - cardsW - gap * 3;
    const cardsX   = gap;
    const rightX   = cardsX + cardsW + gap;

    this._drawCards(cardsX, contentY, cardsW, contentH, s, priv, pub);
    this._drawRight(rightX, contentY, rightW, contentH, s, priv, pub, me, md);
    this._drawBottom(H - botH, W, botH, s, pub);
  }

  // ── Action cards ───────────────────────────────────────────────────────────
  _drawCards(x, y, w, h, s, priv, pub) {
    const fs    = n => `${Math.round(n * s)}px`;
    const cards = priv?.cards ?? [];

    const panelG = this.add.graphics();
    // Glow
    for (let i = 5; i >= 1; i--) {
      const sh = i * Math.round(2 * s);
      panelG.fillStyle(0x00c853, 0.016 * i);
      panelG.fillRoundedRect(x - sh, y - sh, w + sh * 2, h + sh * 2, 16 + sh);
    }
    panelG.fillStyle(0x060e14, 0.92);
    panelG.fillRoundedRect(x, y, w, h, 14);
    panelG.fillStyle(0x00c853, 0.20);
    panelG.fillRoundedRect(x, y, w, Math.round(h * 0.06), 14);
    panelG.lineStyle(1, 0x1e5a2a, 1);
    panelG.strokeRoundedRect(x, y, w, h, 14);
    this.objects.push(panelG);

    this.objects.push(this.add.text(x + w / 2, y + Math.round(14 * s),
      'AKTIONSKARTEN', {
        fontSize: fs(11), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#2a7a3a',
      }).setOrigin(0.5));
    this.objects.push(this.add.text(x + w / 2, y + Math.round(28 * s),
      '1 Karte pro Spieltag wählen', {
        fontSize: fs(8), fontFamily: 'Rajdhani, Arial', color: '#1a5a2a',
      }).setOrigin(0.5));

    if (!cards.length) {
      this.objects.push(this.add.text(x + w / 2, y + h / 2, 'Keine Karten', {
        fontSize: fs(14), fontFamily: 'Oswald, Arial', color: '#2a5a2a',
      }).setOrigin(0.5));
      return;
    }

    const cardW  = w - Math.round(20 * s);
    const cardH  = Math.round(100 * s);
    const gap2   = Math.round(8 * s);
    const startY = y + Math.round(42 * s);

    cards.slice(0, 5).forEach((card, i) => {
      const cy    = startY + i * (cardH + gap2);
      if (cy + cardH > y + h - Math.round(8 * s)) return;
      const isSel  = this.selCard?.uid === card.uid;
      const cCol   = card.color ?? 0x1a3a5a;
      const border = isSel ? 0xffd600 : cCol;

      const cG = this.add.graphics();
      cG.fillStyle(0x060e14, isSel ? 1 : 0.88);
      cG.fillRoundedRect(x + Math.round(10 * s), cy, cardW, cardH, 8);
      cG.lineStyle(isSel ? 2.5 : 1.5, border, 1);
      cG.strokeRoundedRect(x + Math.round(10 * s), cy, cardW, cardH, 8);
      this.objects.push(cG);

      const nameG = this.add.graphics();
      nameG.fillStyle(cCol, isSel ? 1 : 0.7);
      nameG.fillRoundedRect(x + Math.round(10 * s), cy, cardW, Math.round(24 * s), { tl: 8, tr: 8, bl: 0, br: 0 });
      this.objects.push(nameG);

      this.objects.push(this.add.text(x + w / 2, cy + Math.round(12 * s), card.name, {
        fontSize: fs(11), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#fff',
      }).setOrigin(0.5));

      this.objects.push(this.add.text(x + w / 2, cy + Math.round(32 * s), card.desc ?? '', {
        fontSize: fs(9), fontFamily: 'Rajdhani, Arial', color: '#cccccc',
        align: 'center', wordWrap: { width: cardW - Math.round(16 * s) },
      }).setOrigin(0.5, 0));

      if (isSel) {
        this.objects.push(this.add.text(x + w / 2, cy + cardH - Math.round(10 * s), '✓ AUSGEWÄHLT', {
          fontSize: fs(9), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ffd600',
        }).setOrigin(0.5, 1));
      }

      const zone = this.add.zone(x + Math.round(10 * s), cy, cardW, cardH)
        .setOrigin(0).setInteractive({ cursor: 'pointer' });
      zone.on('pointerdown', () => {
        this.selCard   = isSel ? null : card;
        this.selMgr    = null;
        this.selPlayer = null;
        this.redraw();
      });
      this.objects.push(zone);
    });

    if (this.selCard) {
      this._drawTargetPanel(x, y + h - Math.round(160 * s), w, Math.round(150 * s), s, priv, pub);
    }
  }

  _drawTargetPanel(x, y, w, h, s, priv, pub) {
    const fs   = n => `${Math.round(n * s)}px`;
    const card = this.selCard;
    if (!card?.target || card.target === 'auto' || card.target === 'own_team') return;

    const pG = this.add.graphics();
    pG.fillStyle(0x1a1200, 0.95);
    pG.fillRoundedRect(x + Math.round(4 * s), y, w - Math.round(8 * s), h, 8);
    pG.lineStyle(1, 0xffd600, 0.6);
    pG.strokeRoundedRect(x + Math.round(4 * s), y, w - Math.round(8 * s), h, 8);
    this.objects.push(pG);

    this.objects.push(this.add.text(x + w / 2, y + Math.round(10 * s),
      'ZIEL WÄHLEN', {
        fontSize: fs(9), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ffd600',
      }).setOrigin(0.5));

    const roster  = priv?.roster ?? [];
    const lineup  = this.localLineup;
    const players = pub?.players ?? [];

    if (card.target === 'own_player') {
      lineup.slice(0, 6).forEach((pid, i) => {
        const pl  = roster.find(p => p.id === pid);
        if (!pl) return;
        const col = i % 2, row = Math.floor(i / 2);
        const bw  = Math.round((w - Math.round(20 * s)) / 2);
        const bx  = x + Math.round(8 * s) + col * (bw + Math.round(4 * s));
        const by  = y + Math.round(24 * s) + row * Math.round(40 * s);
        const sel = this.selPlayer === pl.id;

        const bg2 = this.add.graphics();
        bg2.fillStyle(sel ? 0x2a1a00 : 0x0a1c0c, 1);
        bg2.fillRoundedRect(bx, by, bw, Math.round(34 * s), 5);
        bg2.lineStyle(1, sel ? 0xffd600 : 0x1a4a22, 1);
        bg2.strokeRoundedRect(bx, by, bw, Math.round(34 * s), 5);
        this.objects.push(bg2);
        this.objects.push(this.add.text(bx + bw / 2, by + Math.round(17 * s),
          pl.name.split(' ').pop(), {
            fontSize: fs(9), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
            color: sel ? '#ffd600' : '#fff',
          }).setOrigin(0.5));
        const z = this.add.zone(bx, by, bw, Math.round(34 * s)).setOrigin(0).setInteractive({ cursor: 'pointer' });
        z.on('pointerdown', () => { this.selPlayer = sel ? null : pl.id; this.redraw(); });
        this.objects.push(z);
      });
    } else {
      const opponents = players.filter(p => p.id !== SocketClient.myPlayerId).slice(0, 7);
      opponents.forEach((opp, i) => {
        const bw  = Math.round((w - Math.round(20 * s)) / 2);
        const col = i % 2, row = Math.floor(i / 2);
        const bx  = x + Math.round(8 * s) + col * (bw + Math.round(4 * s));
        const by  = y + Math.round(24 * s) + row * Math.round(40 * s);
        const sel = this.selMgr === opp.id;

        const bg2 = this.add.graphics();
        bg2.fillStyle(sel ? 0x1a1200 : 0x0a1c0c, 1);
        bg2.fillRoundedRect(bx, by, bw, Math.round(34 * s), 5);
        bg2.lineStyle(1, sel ? 0xffd600 : 0x1a4a22, 1);
        bg2.strokeRoundedRect(bx, by, bw, Math.round(34 * s), 5);
        this.objects.push(bg2);
        this.objects.push(this.add.text(bx + bw / 2, by + Math.round(17 * s),
          opp.name, {
            fontSize: fs(8), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
            color: sel ? '#ffd600' : '#fff',
          }).setOrigin(0.5));
        const z = this.add.zone(bx, by, bw, Math.round(34 * s)).setOrigin(0).setInteractive({ cursor: 'pointer' });
        z.on('pointerdown', () => { this.selMgr = sel ? null : opp.id; this.redraw(); });
        this.objects.push(z);
      });
    }
  }

  // ── Right panel ────────────────────────────────────────────────────────────
  _drawRight(x, y, w, h, s, priv, pub, me, md) {
    const fs  = n => `${Math.round(n * s)}px`;

    const pG = this.add.graphics();
    // Glow
    for (let i = 5; i >= 1; i--) {
      const sh = i * Math.round(2 * s);
      pG.fillStyle(0x2979ff, 0.016 * i);
      pG.fillRoundedRect(x - sh, y - sh, w + sh * 2, h + sh * 2, 16 + sh);
    }
    pG.fillStyle(0x060e14, 0.92);
    pG.fillRoundedRect(x, y, w, h, 14);
    pG.fillStyle(0x2979ff, 0.20);
    pG.fillRoundedRect(x, y, w, Math.round(h * 0.06), 14);
    pG.lineStyle(1, 0x1a3a6a, 1);
    pG.strokeRoundedRect(x, y, w, h, 14);
    this.objects.push(pG);

    // Tabs
    const tabH  = Math.round(36 * s);
    const tabW  = Math.round(w / 2 - 2 * s);
    const tabs  = [
      { id: 'lineup',  label: 'MEINE STARTELF' },
      { id: 'fixture', label: this._fixtureLabel(pub, me) },
    ];
    tabs.forEach((t, i) => {
      const tx     = x + i * (tabW + Math.round(4 * s));
      const active = this.tab === t.id;
      const tG = this.add.graphics();
      tG.fillStyle(active ? 0x00152a : 0x0a1a2a, 1);
      tG.fillRoundedRect(tx, y, tabW, tabH, { tl: i === 0 ? 14 : 0, tr: i === 1 ? 14 : 0, bl: 0, br: 0 });
      if (active) { tG.lineStyle(1, 0x2979ff, 1); tG.strokeRoundedRect(tx, y, tabW, tabH, { tl: i === 0 ? 14 : 0, tr: i === 1 ? 14 : 0, bl: 0, br: 0 }); }
      this.objects.push(tG);
      this.objects.push(this.add.text(tx + tabW / 2, y + tabH / 2, t.label, {
        fontSize: fs(10), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
        color: active ? '#82b1ff' : '#2a4a7a',
      }).setOrigin(0.5));
      if (!active) {
        const z = this.add.zone(tx, y, tabW, tabH).setOrigin(0).setInteractive({ cursor: 'pointer' });
        z.on('pointerdown', () => { this.tab = t.id; this.redraw(); });
        this.objects.push(z);
      }
    });

    const contentY2 = y + tabH + Math.round(6 * s);
    const contentH2 = h - tabH - Math.round(6 * s);

    if (this.tab === 'lineup') {
      this._drawLineupTab(x, contentY2, w, contentH2, s, priv);
    } else {
      this._drawFixtureTab(x, contentY2, w, contentH2, s, pub, me, md);
    }
  }

  _fixtureLabel(pub, me) {
    if (!me || !pub) return 'PAARUNG';
    const md      = (pub.currentMatchday ?? 0) + 1;
    const fixture = (pub.fixtures?.[md - 1] ?? []).find(f => f.homeId === me.id || f.awayId === me.id);
    if (!fixture) return 'PAARUNG';
    const oppId  = fixture.homeId === me.id ? fixture.awayId : fixture.homeId;
    const opp    = pub.players?.[oppId];
    return `${me.name.split(' ')[0]} vs. ${opp?.name?.split(' ')[0] ?? '?'}`;
  }

  _drawLineupTab(x, y, w, h, s, priv) {
    const fs     = n => `${Math.round(n * s)}px`;
    const roster = priv?.roster ?? [];
    const lineup = this.localLineup;
    const rowH   = Math.round(46 * s);

    lineup.forEach((pid, i) => {
      const pl = roster.find(p => p.id === pid);
      if (!pl) return;
      const ry  = y + i * rowH;
      if (ry + rowH > y + h - Math.round(4 * s)) return;
      const col = POS_COL[pl.pos] ?? 0x888888;
      const r   = Math.round((pl.atk + pl.def + pl.spd + (pl.sta ?? 70)) / 4);

      const rG = this.add.graphics();
      rG.fillStyle(0x0a1c0c, 1);
      rG.fillRoundedRect(x + Math.round(8 * s), ry + Math.round(2 * s),
        w - Math.round(16 * s), rowH - Math.round(4 * s), 6);
      this.objects.push(rG);

      const bG = this.add.graphics();
      bG.fillStyle(col, 1);
      bG.fillRoundedRect(x + Math.round(12 * s), ry + Math.round(12 * s),
        Math.round(32 * s), Math.round(18 * s), 4);
      this.objects.push(bG);
      this.objects.push(this.add.text(x + Math.round(28 * s), ry + Math.round(21 * s), pl.pos, {
        fontSize: fs(10), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#000',
      }).setOrigin(0.5));

      this.objects.push(this.add.text(x + Math.round(52 * s), ry + Math.round(13 * s), pl.name, {
        fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
        color: pl.isDefault ? '#5a7a5a' : '#fff',
      }));
      this.objects.push(this.add.text(x + Math.round(52 * s), ry + Math.round(29 * s),
        pl.isDefault ? 'Standard-Spieler' : `⚔${pl.atk}  🛡${pl.def}  ⚡${pl.spd}`, {
          fontSize: fs(9), fontFamily: 'Rajdhani, Arial', color: '#666',
        }));

      if (!pl.isDefault) {
        const rCol = r >= 70 ? '#ffd600' : '#aaa';
        this.objects.push(this.add.text(x + w - Math.round(14 * s), ry + Math.round(rowH / 2 - 7 * s),
          `★ ${r}`, {
            fontSize: fs(13), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: rCol,
          }).setOrigin(1, 0));
      }
    });

    if (!lineup.length) {
      this.objects.push(this.add.text(x + w / 2, y + h / 2, '⚠ Keine Startelf gesetzt', {
        fontSize: fs(14), fontFamily: 'Oswald, Arial', color: '#f39c12',
      }).setOrigin(0.5));
    }
  }

  _drawFixtureTab(x, y, w, h, s, pub, me, md) {
    const fs      = n => `${Math.round(n * s)}px`;
    const CX2     = x + w / 2;
    const fixture = (pub?.fixtures?.[md - 1] ?? []).find(f =>
      f.homeId === me?.id || f.awayId === me?.id
    );

    if (!fixture) {
      this.objects.push(this.add.text(CX2, y + h / 2, 'Kein Spiel gefunden', {
        fontSize: fs(14), fontFamily: 'Oswald, Arial', color: '#3a6a3a',
      }).setOrigin(0.5));
      return;
    }

    const isHome  = fixture.homeId === me.id;
    const oppId   = isHome ? fixture.awayId : fixture.homeId;
    const opp     = pub?.players?.[oppId];
    const sideTag = isHome ? '🏠 HEIMSPIEL' : '✈ AUSWÄRTSSPIEL';

    this.objects.push(this.add.text(CX2, y + Math.round(20 * s), sideTag, {
      fontSize: fs(11), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
      color: isHome ? '#ffd600' : '#82b1ff',
    }).setOrigin(0.5));

    const vsY = y + Math.round(60 * s);
    this.objects.push(this.add.text(CX2 - Math.round(100 * s), vsY, me?.name ?? '', {
      fontSize: fs(18), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#00e676',
    }).setOrigin(1, 0.5));
    this.objects.push(this.add.text(CX2, vsY, 'VS', {
      fontSize: fs(14), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#3a6a3a',
    }).setOrigin(0.5));
    this.objects.push(this.add.text(CX2 + Math.round(100 * s), vsY, opp?.name ?? '?', {
      fontSize: fs(18), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#ff7043',
    }).setOrigin(0, 0.5));

    this.objects.push(this.add.text(CX2 - Math.round(100 * s), vsY + Math.round(22 * s), me?.clubName ?? '', {
      fontSize: fs(9), fontFamily: 'Rajdhani, Arial', color: '#3a6a3a',
    }).setOrigin(1, 0));
    this.objects.push(this.add.text(CX2 + Math.round(100 * s), vsY + Math.round(22 * s), opp?.clubName ?? '', {
      fontSize: fs(9), fontFamily: 'Rajdhani, Arial', color: '#3a6a3a',
    }).setOrigin(0, 0));

    this.objects.push(this.add.text(CX2 - Math.round(100 * s), vsY + Math.round(38 * s),
      me?.formation ?? '?', {
        fontSize: fs(10), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ffd600',
      }).setOrigin(1, 0));
    this.objects.push(this.add.text(CX2 + Math.round(100 * s), vsY + Math.round(38 * s),
      opp?.formation ?? '?', {
        fontSize: fs(10), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ffd600',
      }).setOrigin(0, 0));

    const statsY = y + Math.round(h * 0.52);
    const stats = [
      { label: 'Punkte',  me: me?.points ?? 0,       opp: opp?.points ?? 0       },
      { label: 'Kader',   me: me?.rosterSize ?? 0,    opp: opp?.rosterSize ?? 0   },
      { label: 'Budget',  me: `${me?.budget ?? 0}M`,  opp: `${opp?.budget ?? 0}M` },
    ];
    stats.forEach((st, i) => {
      const sy = statsY + i * Math.round(36 * s);
      const dG = this.add.graphics();
      dG.fillStyle(0x0a1c0c, 1);
      dG.fillRoundedRect(x + Math.round(10 * s), sy, w - Math.round(20 * s), Math.round(30 * s), 5);
      this.objects.push(dG);
      this.objects.push(this.add.text(CX2, sy + Math.round(15 * s), st.label, {
        fontSize: fs(9), fontFamily: 'Oswald, Arial', color: '#3a6a3a',
      }).setOrigin(0.5));
      this.objects.push(this.add.text(CX2 - Math.round(20 * s), sy + Math.round(15 * s), String(st.me), {
        fontSize: fs(11), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#00e676',
      }).setOrigin(1, 0.5));
      this.objects.push(this.add.text(CX2 + Math.round(20 * s), sy + Math.round(15 * s), String(st.opp), {
        fontSize: fs(11), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ff7043',
      }).setOrigin(0, 0.5));
    });
  }

  // ── Bottom bar ─────────────────────────────────────────────────────────────
  _drawBottom(y, W, h, s, pub) {
    const fs         = n => `${Math.round(n * s)}px`;
    const readyCount = pub?.readyCount ?? 0;
    const total      = pub?.totalCount ?? pub?.players?.length ?? 0;

    const bg = this.add.graphics();
    bg.fillStyle(0x061008, 0.95);
    bg.fillRect(0, y, W, h);
    bg.fillStyle(0x1e3a24, 1);
    bg.fillRect(0, y, W, 1);
    this.objects.push(bg);

    const barW  = Math.round(300 * s);
    const barH2 = Math.round(6 * s);
    const barX  = Math.round(16 * s);
    const barY  = y + Math.round(h / 2 + 10 * s);

    this.objects.push(this.add.text(barX, y + Math.round(16 * s),
      `✅  Bereit: ${readyCount} / ${total} Spieler`, {
        fontSize: fs(13), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#00c853',
      }));

    const barBg = this.add.graphics();
    barBg.fillStyle(0x000000, 0.4); barBg.fillRoundedRect(barX, barY, barW, barH2, 3);
    const barFg = this.add.graphics();
    barFg.fillStyle(0x00c853, 1);
    if (total > 0) barFg.fillRoundedRect(barX, barY, (readyCount / total) * barW, barH2, 3);
    this.objects.push(barBg, barFg);

    const btnH  = Math.round(44 * s);
    const btnY2 = y + (h - btnH) / 2;

    const kW = Math.round(180 * s);
    const kX = W - Math.round(16 * s) - Math.round(260 * s) - kW - Math.round(8 * s);
    const kG = this.add.graphics();
    kG.fillStyle(0x1a3a1a, 1);
    kG.fillRoundedRect(kX, btnY2, kW, btnH, 8);
    this.objects.push(kG);
    this.objects.push(this.add.text(kX + kW / 2, btnY2 + btnH / 2, '👕  Kader ändern', {
      fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#5a8a5a',
    }).setOrigin(0.5));
    const kZ = this.add.zone(kX, btnY2, kW, btnH).setOrigin(0).setInteractive({ cursor: 'pointer' });
    kZ.on('pointerover',  () => { kG.clear(); kG.fillStyle(0x2a5a2a, 1); kG.fillRoundedRect(kX, btnY2, kW, btnH, 8); });
    kZ.on('pointerout',   () => { kG.clear(); kG.fillStyle(0x1a3a1a, 1); kG.fillRoundedRect(kX, btnY2, kW, btnH, 8); });
    kZ.on('pointerdown',  () => this.scene.start('TeamScene'));
    this.objects.push(kZ);

    const rW = Math.round(260 * s);
    const rX = W - Math.round(16 * s) - rW;
    const rG = this.add.graphics();
    rG.fillStyle(0x00c853, 1);
    rG.fillRoundedRect(rX, btnY2, rW, btnH, 8);
    this.objects.push(rG);
    this.objects.push(this.add.text(rX + rW / 2, btnY2 + btnH / 2, '✅  BEREIT FÜR SPIELTAG', {
      fontSize: fs(13), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#000',
    }).setOrigin(0.5));
    const rZ = this.add.zone(rX, btnY2, rW, btnH).setOrigin(0).setInteractive({ cursor: 'pointer' });
    rZ.on('pointerover',  () => { rG.clear(); rG.fillStyle(0x00e676, 1); rG.fillRoundedRect(rX, btnY2, rW, btnH, 8); });
    rZ.on('pointerout',   () => { rG.clear(); rG.fillStyle(0x00c853, 1); rG.fillRoundedRect(rX, btnY2, rW, btnH, 8); });
    rZ.on('pointerdown',  () => this._submitAndReady());
    this.objects.push(rZ);
  }

  // ── Waiting overlay ────────────────────────────────────────────────────────
  _drawWaiting(W, H, barH, s, pub) {
    const fs         = n => `${Math.round(n * s)}px`;
    const CX         = W / 2;
    const readyCount = pub?.readyCount ?? 0;
    const total      = pub?.totalCount ?? 0;
    const players    = pub?.players ?? [];

    const bW = Math.round(580 * s);
    const bH = Math.round(320 * s);
    const bX = CX - bW / 2;
    const bY = barH + (H - barH - bH) / 2;

    const gfx = this.add.graphics();
    for (let i = 6; i >= 1; i--) {
      const sh = i * Math.round(2 * s);
      gfx.fillStyle(0x00c853, 0.022 * i);
      gfx.fillRoundedRect(bX - sh, bY - sh, bW + sh * 2, bH + sh * 2, 16 + sh);
    }
    gfx.fillStyle(0x060e14, 0.97);
    gfx.fillRoundedRect(bX, bY, bW, bH, 16);
    gfx.fillStyle(0x00c853, 0.45);
    gfx.fillRoundedRect(bX, bY, bW, Math.round(bH * 0.20), 16);
    gfx.lineStyle(2, 0x00c853, 1);
    gfx.strokeRoundedRect(bX, bY, bW, bH, 16);
    this.objects.push(gfx);

    this.objects.push(this.add.text(CX, bY + Math.round(28 * s), '✅  Du bist bereit!', {
      fontSize: fs(22), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#00e676',
    }).setOrigin(0.5));
    this.objects.push(this.add.text(CX, bY + Math.round(56 * s), 'Warte auf die anderen Spieler…', {
      fontSize: fs(13), fontFamily: 'Rajdhani, Arial', color: '#5a8a5a',
    }).setOrigin(0.5));

    const pbW = bW - Math.round(60 * s);
    const pbY  = bY + Math.round(78 * s);
    const pbH  = Math.round(8 * s);
    const pbG  = this.add.graphics();
    pbG.fillStyle(0x000000, 0.4); pbG.fillRoundedRect(bX + Math.round(30 * s), pbY, pbW, pbH, 4);
    if (total > 0) { pbG.fillStyle(0x00c853, 1); pbG.fillRoundedRect(bX + Math.round(30 * s), pbY, pbW * (readyCount / total), pbH, 4); }
    this.objects.push(pbG);
    this.objects.push(this.add.text(CX, pbY + Math.round(16 * s), `${readyCount} von ${total} bereit`, {
      fontSize: fs(11), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#00c853',
    }).setOrigin(0.5));

    const colCount = Math.ceil(players.length / 2);
    players.slice(0, 8).forEach((p, i) => {
      const col   = Math.floor(i / colCount);
      const row   = i % colCount;
      const px    = bX + Math.round(30 * s) + col * (pbW / 2);
      const py    = pbY + Math.round(36 * s) + row * Math.round(26 * s);
      const ready = this.readyPlayers.has(p.name);
      this.objects.push(this.add.text(px, py, `${ready ? '✅' : '⏳'}  ${p.name}`, {
        fontSize: fs(11), fontFamily: 'Oswald, Arial',
        color: ready ? '#00e676' : '#3a6a3a',
      }));
    });
  }

  // ── Logic ──────────────────────────────────────────────────────────────────
  _submitAndReady() {
    if (this.submitted) return;
    this.submitted = true;
    SocketClient.emit('submit_prep', {
      lineup:          this.localLineup,
      cardUid:         this.selCard?.uid ?? null,
      targetManagerId: this.selMgr    ?? null,
      targetPlayerId:  this.selPlayer ?? null,
    });
    SocketClient.emit('ready_for_matchday');
    this.readyPlayers.add(SocketClient.me?.name ?? '');
    this.redraw();
  }

  _onShutdown() {
    this.scale.off('resize', this.redraw, this);
    this.unsubs.forEach(u => u?.());
    this.objects.forEach(o => { try { o?.destroy(); } catch (_) {} });
  }

  shutdown() { this._onShutdown(); }
}
