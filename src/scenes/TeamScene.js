import { SocketClient }                 from '../network/SocketClient.js';
import { addStadiumBg, preloadStadium } from '../ui/SceneBackground.js';

// ── Formations ────────────────────────────────────────────────────────────────
export const FORMATIONS = [
  { id: '4-3-3', label: '4-3-3', desc: 'Ausgewogen',         icon: '⚖',  slots: { GK:1, DEF:4, MID:3, FWD:3 } },
  { id: '4-4-2', label: '4-4-2', desc: 'Klassisch stabil',   icon: '🛡',  slots: { GK:1, DEF:4, MID:4, FWD:2 } },
  { id: '5-3-2', label: '5-3-2', desc: 'Defensiv',           icon: '🔒',  slots: { GK:1, DEF:5, MID:3, FWD:2 } },
  { id: '4-5-1', label: '4-5-1', desc: 'Kompakt',            icon: '🧱',  slots: { GK:1, DEF:4, MID:5, FWD:1 } },
  { id: '3-5-2', label: '3-5-2', desc: 'Mittelfeld-Fokus',   icon: '🔄',  slots: { GK:1, DEF:3, MID:5, FWD:2 } },
  { id: '3-4-3', label: '3-4-3', desc: 'Sehr offensiv',      icon: '⚡',  slots: { GK:1, DEF:3, MID:4, FWD:3 } },
];

const FORMATION_INFO = {
  '4-3-3': { atk: 50, def: 50, label: 'Ausgewogen — gleichmäßige Angriffs- und Defensivstärke' },
  '4-4-2': { atk: 40, def: 62, label: 'Stabil — starkes Mittelfeld puffert Defensive ab' },
  '5-3-2': { atk: 28, def: 80, label: 'Defensiv — Festung hinten, wenig Angriff' },
  '4-5-1': { atk: 32, def: 72, label: 'Kompakt — ein Stürmer, viele Mitspieler' },
  '3-5-2': { atk: 54, def: 44, label: 'Mittelfeld — Ballkontrolle, flexible Angriffe' },
  '3-4-3': { atk: 78, def: 30, label: 'Offensiv — viele Tore, aber anfällig' },
};

function makeSlotDefs(formationId) {
  const f   = FORMATIONS.find(x => x.id === formationId) ?? FORMATIONS[0];
  const out = [];
  for (let i = 0; i < f.slots.GK;  i++) out.push({ pos: 'GK'  });
  for (let i = 0; i < f.slots.DEF; i++) out.push({ pos: 'DEF' });
  for (let i = 0; i < f.slots.MID; i++) out.push({ pos: 'MID' });
  for (let i = 0; i < f.slots.FWD; i++) out.push({ pos: 'FWD' });
  return out;
}

function formationRows(formationId) {
  const f = FORMATIONS.find(x => x.id === formationId) ?? FORMATIONS[0];
  const rows = [];
  if (f.slots.FWD > 0) rows.push({ pos: 'FWD', yFrac: 0.12 });
  if (f.slots.MID > 0) rows.push({ pos: 'MID', yFrac: 0.36 });
  if (f.slots.DEF > 0) rows.push({ pos: 'DEF', yFrac: 0.60 });
  if (f.slots.GK  > 0) rows.push({ pos: 'GK',  yFrac: 0.84 });
  return rows;
}

const POS_COL = { GK: 0xf39c12, DEF: 0x27ae60, MID: 0x3498db, FWD: 0xe74c3c };

const OOP_MULT = {
  GK:  { GK: 1.00, DEF: 0.45, MID: 0.35, FWD: 0.30 },
  DEF: { GK: 0.40, DEF: 1.00, MID: 0.82, FWD: 0.68 },
  MID: { GK: 0.35, DEF: 0.85, MID: 1.00, FWD: 0.85 },
  FWD: { GK: 0.30, DEF: 0.62, MID: 0.82, FWD: 1.00 },
};

function rating(pl)             { return Math.round((pl.atk + pl.def + pl.spd + pl.sta) / 4); }
function oopRating(pl, slotPos) { return Math.round(rating(pl) * (OOP_MULT[pl.pos]?.[slotPos] ?? 1)); }

// ── Scene ─────────────────────────────────────────────────────────────────────
export class TeamScene extends Phaser.Scene {
  constructor() { super('TeamScene'); }

  preload() { preloadStadium(this); }

  create() {
    this.objects     = [];
    this.unsubs      = [];
    this._ghost      = [];
    this._hoverGfx   = null;
    this._dragSource = null;
    this._formation  = '4-3-3';
    this._slots      = makeSlotDefs(this._formation).map((d, i) => ({ ...d, player: null, idx: i }));
    this._slotMeta   = [];

    const priv = SocketClient.privateState;
    if (priv) this._syncSlots(priv.lineup ?? [], priv.roster ?? []);

    this.unsubs.push(SocketClient.on('private_state', ps => {
      if (!this._dragSource) this._syncSlots(ps.lineup ?? [], ps.roster ?? []);
      this.redraw();
    }));
    this.unsubs.push(SocketClient.on('phase_changed', ({ phase }) => {
      if (phase === 'prep') this.scene.start('MatchdayPrepScene');
    }));

    this.input.on('pointermove', ptr => this._onDragMove(ptr));
    this.input.on('pointerup',   ptr => this._onDragEnd(ptr));
    this.scale.on('resize',  () => this.redraw(), this);
    this.events.on('shutdown', () => this._onShutdown(), this);

    this.redraw();
  }

  // ── Slot helpers ───────────────────────────────────────────────────────────
  _syncSlots(lineup, roster) {
    const defs = makeSlotDefs(this._formation);
    this._slots = defs.map((d, i) => ({ ...d, player: null, idx: i }));
    const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
    lineup.forEach(id => {
      const pl = roster.find(p => p.id === id);
      if (pl) byPos[pl.pos]?.push(pl);
    });
    this._slots.forEach(slot => {
      const pool = byPos[slot.pos];
      if (pool?.length) slot.player = pool.shift();
    });
  }

  _changeFormation(id) {
    if (id === this._formation) return;
    const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
    this._slots.forEach(s => { if (s.player) byPos[s.pos].push(s.player); });

    this._formation = id;
    const defs = makeSlotDefs(id);
    this._slots = defs.map((d, i) => ({ ...d, player: null, idx: i }));

    const newByPos = { GK: [], DEF: [], MID: [], FWD: [] };
    this._slots.forEach(s => newByPos[s.pos].push(s));
    Object.entries(byPos).forEach(([pos, players]) => {
      players.forEach((pl, i) => {
        if (newByPos[pos]?.[i]) newByPos[pos][i].player = pl;
      });
    });

    this.redraw();
  }

  _lineupFromSlots()  { return this._slots.filter(s => s.player).map(s => s.player.id); }
  _slotAssignments()  {
    const map = {};
    this._slots.forEach(s => { if (s.player) map[s.player.id] = s.pos; });
    return map;
  }
  _benchPlayers(roster) {
    const inSlot = new Set(this._slots.filter(s => s.player).map(s => s.player.id));
    return roster.filter(p => !inSlot.has(p.id));
  }
  _isValid() {
    const f = FORMATIONS.find(x => x.id === this._formation) ?? FORMATIONS[0];
    const cnt = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    this._slots.forEach(s => { if (s.player) cnt[s.pos]++; });
    return cnt.GK >= f.slots.GK && cnt.DEF >= f.slots.DEF
        && cnt.MID >= f.slots.MID && cnt.FWD >= f.slots.FWD;
  }

  // ── Redraw ─────────────────────────────────────────────────────────────────
  redraw() {
    this._destroyGhost();
    this._dragSource = null;
    if (this._hoverGfx) { try { this._hoverGfx.destroy(); } catch (_) {} this._hoverGfx = null; }
    this.objects.forEach(o => { try { o?.destroy(); } catch (_) {} });
    this.objects   = [];
    this._slotMeta = [];

    const W  = this.scale.width;
    const H  = this.scale.height;
    const s  = Math.min(W / 1280, H / 720);
    const fs = n => `${Math.round(n * s)}px`;
    this._s  = s;

    const priv   = SocketClient.privateState;
    const roster = priv?.roster ?? [];

    // ── Background: stadium + overlay ─────────────────────────────────────
    addStadiumBg(this, this.objects, W, H);

    // ── Top bar ────────────────────────────────────────────────────────────
    const barH = Math.round(52 * s);
    const topG = this.add.graphics();
    topG.fillStyle(0x061008, 0.92);
    topG.fillRect(0, 0, W, barH);
    topG.fillStyle(0xffd600, 1);
    topG.fillRect(0, barH - 2, W, 2);
    this.objects.push(topG);

    const me = SocketClient.me;
    this.objects.push(this.add.text(Math.round(16 * s), barH / 2, '⚽  FANTASY MANAGER', {
      fontSize: fs(18), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#fff',
    }).setOrigin(0, 0.5));
    this.objects.push(this.add.text(W - Math.round(16 * s), barH / 2,
      `${me?.name ?? ''}  ·  ${me?.clubName ?? ''}  ·  💰 ${me?.budget ?? '–'}M`, {
        fontSize: fs(13), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ffd600',
      }).setOrigin(1, 0.5));

    // Layout
    const formBarH = Math.round(56 * s);
    const botH     = Math.round(68 * s);
    const contentY = barH + formBarH + Math.round(6 * s);
    const contentH = H - contentY - botH - Math.round(6 * s);
    const gap      = Math.round(10 * s);
    const listW    = Math.round(310 * s);
    const pitchW   = W - listW - gap * 3;
    const pitchX   = gap;
    const listX    = pitchX + pitchW + gap;

    this._drawFormationBar(barH, W, formBarH, s);
    this._drawPitch(pitchX, contentY, pitchW, contentH, s);
    this._drawList(listX, contentY, listW, contentH, s, roster);
    this._drawBottomBar(H - botH, W, botH, s);

    this._hoverGfx = this.add.graphics().setDepth(90);
  }

  // ── Formation selector bar ─────────────────────────────────────────────────
  _drawFormationBar(y, W, h, s) {
    const fs = n => `${Math.round(n * s)}px`;

    const bg = this.add.graphics();
    bg.fillStyle(0x060e14, 0.85);
    bg.fillRect(0, y, W, h);
    this.objects.push(bg);

    const btnCount = FORMATIONS.length;
    const btnW     = Math.round(130 * s);
    const btnH     = Math.round(36 * s);
    const btnGap   = Math.round(8 * s);
    const totalW   = btnCount * btnW + (btnCount - 1) * btnGap;
    const startX   = (W - totalW) / 2;
    const btnY     = y + (h - btnH) / 2;

    FORMATIONS.forEach((f, i) => {
      const bx      = startX + i * (btnW + btnGap);
      const active  = f.id === this._formation;
      const btnCol  = active ? 0x00c853 : 0x0d2010;
      const border  = active ? 0x00e676 : 0x1a4a22;

      const g = this.add.graphics();
      g.fillStyle(btnCol, 1);
      g.fillRoundedRect(bx, btnY, btnW, btnH, 6);
      g.lineStyle(active ? 2 : 1, border, 1);
      g.strokeRoundedRect(bx, btnY, btnW, btnH, 6);
      this.objects.push(g);

      this.objects.push(this.add.text(bx + btnW / 2, btnY + Math.round(11 * s),
        `${f.icon} ${f.label}`, {
          fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
          color: active ? '#000' : '#7ab87a',
        }).setOrigin(0.5));
      this.objects.push(this.add.text(bx + btnW / 2, btnY + Math.round(26 * s),
        f.desc, {
          fontSize: fs(8), fontFamily: 'Rajdhani, Arial',
          color: active ? '#003010' : '#2a5a2a',
        }).setOrigin(0.5));

      if (!active) {
        const zone = this.add.zone(bx, btnY, btnW, btnH).setOrigin(0).setInteractive({ cursor: 'pointer' });
        zone.on('pointerover',  () => { g.clear(); g.fillStyle(0x1a3a1a, 1); g.fillRoundedRect(bx, btnY, btnW, btnH, 6); g.lineStyle(1, 0x00c853, 0.5); g.strokeRoundedRect(bx, btnY, btnW, btnH, 6); });
        zone.on('pointerout',   () => { g.clear(); g.fillStyle(btnCol,   1); g.fillRoundedRect(bx, btnY, btnW, btnH, 6); g.lineStyle(1, border,  1); g.strokeRoundedRect(bx, btnY, btnW, btnH, 6); });
        zone.on('pointerdown',  () => this._changeFormation(f.id));
        this.objects.push(zone);
      }
    });

    // Tactic info bar
    const info = FORMATION_INFO[this._formation];
    if (info) {
      const barW   = Math.round(260 * s);
      const infoX  = W - Math.round(16 * s) - barW;
      const infoY  = y + Math.round(6 * s);
      const infoH  = h - Math.round(12 * s);
      const infoG  = this.add.graphics();
      infoG.fillStyle(0x000000, 0.5);
      infoG.fillRoundedRect(infoX, infoY, barW, infoH, 6);
      this.objects.push(infoG);

      const bW = Math.round(80 * s);
      const bH = Math.round(6 * s);
      const bY1 = infoY + Math.round(10 * s);
      const bY2 = infoY + Math.round(24 * s);

      this.objects.push(this.add.text(infoX + Math.round(8 * s), bY1, '⚔ ATK', {
        fontSize: fs(8), fontFamily: 'Oswald, Arial', color: '#e74c3c',
      }));
      const atkBg = this.add.graphics();
      atkBg.fillStyle(0x1a0a0a, 1); atkBg.fillRoundedRect(infoX + Math.round(44 * s), bY1 - Math.round(2 * s), bW, bH, 2);
      const atkFg = this.add.graphics();
      atkFg.fillStyle(0xe74c3c, 1); atkFg.fillRoundedRect(infoX + Math.round(44 * s), bY1 - Math.round(2 * s), (info.atk / 100) * bW, bH, 2);
      this.objects.push(atkBg, atkFg);
      this.objects.push(this.add.text(infoX + Math.round(44 * s) + bW + Math.round(4 * s), bY1, `${info.atk}%`, {
        fontSize: fs(8), fontFamily: 'Rajdhani, Arial', color: '#e74c3c',
      }));

      this.objects.push(this.add.text(infoX + Math.round(8 * s), bY2, '🛡 DEF', {
        fontSize: fs(8), fontFamily: 'Oswald, Arial', color: '#27ae60',
      }));
      const defBg = this.add.graphics();
      defBg.fillStyle(0x0a1a0a, 1); defBg.fillRoundedRect(infoX + Math.round(44 * s), bY2 - Math.round(2 * s), bW, bH, 2);
      const defFg = this.add.graphics();
      defFg.fillStyle(0x27ae60, 1); defFg.fillRoundedRect(infoX + Math.round(44 * s), bY2 - Math.round(2 * s), (info.def / 100) * bW, bH, 2);
      this.objects.push(defBg, defFg);
      this.objects.push(this.add.text(infoX + Math.round(44 * s) + bW + Math.round(4 * s), bY2, `${info.def}%`, {
        fontSize: fs(8), fontFamily: 'Rajdhani, Arial', color: '#27ae60',
      }));
    }
  }

  // ── Pitch (stays green — it's a football pitch) ────────────────────────────
  _drawPitch(x, y, w, h, s) {
    const pg = this.add.graphics();
    pg.fillStyle(0x155a22, 1);
    pg.fillRoundedRect(x, y, w, h, 10);
    const sh = Math.round(50 * s);
    for (let i = 0; i < Math.ceil(h / sh); i++) {
      if (i % 2 === 0) { pg.fillStyle(0x186628, 1); pg.fillRect(x, y + i * sh, w, sh); }
    }
    pg.lineStyle(Math.round(1.5 * s), 0xffffff, 0.18);
    pg.lineBetween(x + Math.round(16 * s), y + h / 2, x + w - Math.round(16 * s), y + h / 2);
    pg.strokeCircle(x + w / 2, y + h / 2, Math.round(48 * s));
    const paW = w * 0.55, paH = h * 0.13;
    pg.strokeRect(x + (w - paW) / 2, y + Math.round(8 * s), paW, paH);
    pg.strokeRect(x + (w - paW) / 2, y + h - paH - Math.round(8 * s), paW, paH);
    pg.lineStyle(1, 0xffffff, 0.07);
    pg.strokeRoundedRect(x + Math.round(8 * s), y + Math.round(8 * s),
      w - Math.round(16 * s), h - Math.round(16 * s), 4);
    this.objects.push(pg);

    this.objects.push(this.add.text(x + w / 2, y + Math.round(10 * s),
      this._formation, {
        fontSize: `${Math.round(11 * s)}px`, fontFamily: 'Oswald, Arial',
        fontStyle: 'bold', color: 'rgba(255,255,255,0.12)',
      }).setOrigin(0.5));

    const slotW = Math.round(88 * s);
    const slotH = Math.round(74 * s);

    const byPos = {};
    this._slots.forEach(slot => {
      if (!byPos[slot.pos]) byPos[slot.pos] = [];
      byPos[slot.pos].push(slot);
    });

    formationRows(this._formation).forEach(row => {
      const rowSlots = byPos[row.pos] ?? [];
      const n        = rowSlots.length;
      const spacing  = w / (n + 1);
      rowSlots.forEach((slot, i) => {
        const cx = x + spacing * (i + 1);
        const cy = y + row.yFrac * h;
        this._slotMeta.push({ cx, cy, slotW, slotH, slotIdx: slot.idx });
        this._drawSlot(cx, cy, slotW, slotH, slot, s);
      });
    });
  }

  _drawSlot(cx, cy, slotW, slotH, slot, s) {
    const fs    = n => `${Math.round(n * s)}px`;
    const col   = POS_COL[slot.pos] ?? 0x888888;
    const pl    = slot.player;

    if (pl) {
      const isOOP    = pl.pos !== slot.pos;
      const borderCol = isOOP ? 0xff9800 : col;

      const g = this.add.graphics();
      g.fillStyle(0x061008, 0.92);
      g.fillRoundedRect(cx - slotW / 2, cy - slotH / 2, slotW, slotH, 8);
      g.lineStyle(isOOP ? 2.5 : 2, borderCol, 1);
      g.strokeRoundedRect(cx - slotW / 2, cy - slotH / 2, slotW, slotH, 8);
      g.fillStyle(POS_COL[pl.pos] ?? col, 1);
      g.fillRect(cx - slotW / 2 + 1, cy - slotH / 2 + 1, slotW - 2, Math.round(4 * s));
      this.objects.push(g);

      const bG = this.add.graphics();
      bG.fillStyle(POS_COL[pl.pos] ?? col, 1);
      bG.fillRoundedRect(cx - Math.round(14 * s), cy - slotH / 2 + Math.round(6 * s),
        Math.round(28 * s), Math.round(13 * s), 3);
      this.objects.push(bG);
      this.objects.push(this.add.text(cx, cy - slotH / 2 + Math.round(12 * s), pl.pos, {
        fontSize: fs(8), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#000',
      }).setOrigin(0.5));

      if (isOOP) {
        this.objects.push(this.add.text(
          cx + slotW / 2 - Math.round(5 * s), cy - slotH / 2 + Math.round(5 * s), '⚠', {
            fontSize: fs(9),
          }).setOrigin(1, 0));
      }

      this.objects.push(this.add.text(cx, cy - Math.round(8 * s),
        pl.name.split(' ').pop(), {
          fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
          color: isOOP ? '#ffcc80' : '#fff',
        }).setOrigin(0.5));

      if (!pl.isDefault) {
        const realR = rating(pl);
        const effR  = oopRating(pl, slot.pos);
        const rCol  = effR >= 70 ? '#ffd600' : (effR >= 50 ? '#fff' : '#ff9800');
        this.objects.push(this.add.text(cx, cy + Math.round(14 * s),
          isOOP ? `★ ${effR}  (${realR})` : `★ ${realR}`, {
            fontSize: fs(isOOP ? 9 : 11), fontFamily: 'Oswald, Arial',
            fontStyle: 'bold', color: rCol,
          }).setOrigin(0.5));
      } else {
        this.objects.push(this.add.text(cx, cy + Math.round(14 * s), '—', {
          fontSize: fs(11), fontFamily: 'Oswald, Arial', color: '#555',
        }).setOrigin(0.5));
      }

      const zone = this.add.zone(cx - slotW / 2, cy - slotH / 2, slotW, slotH)
        .setOrigin(0).setInteractive({ cursor: 'grab' });
      zone.on('pointerdown', ptr => this._startDragFromPitch(slot.idx, pl, ptr));
      this.objects.push(zone);

    } else {
      const g = this.add.graphics();
      g.lineStyle(2, col, 0.38);
      g.strokeRoundedRect(cx - slotW / 2, cy - slotH / 2, slotW, slotH, 8);
      g.fillStyle(0x000000, 0.14);
      g.fillRoundedRect(cx - slotW / 2, cy - slotH / 2, slotW, slotH, 8);
      this.objects.push(g);
      this.objects.push(this.add.text(cx, cy, slot.pos, {
        fontSize: `${Math.round(14 * s)}px`,
        fontFamily: 'Oswald, Arial', fontStyle: 'bold',
        color: '#' + col.toString(16).padStart(6, '0'),
      }).setOrigin(0.5).setAlpha(0.35));
    }
  }

  // ── Bench list ─────────────────────────────────────────────────────────────
  _drawList(x, y, w, h, s, roster) {
    const fs = n => `${Math.round(n * s)}px`;

    const gfx = this.add.graphics();
    // Glow
    for (let i = 5; i >= 1; i--) {
      const shrink = i * Math.round(2 * s);
      gfx.fillStyle(0x00c853, 0.018 * i);
      gfx.fillRoundedRect(x - shrink, y - shrink, w + shrink * 2, h + shrink * 2, 16 + shrink);
    }
    gfx.fillStyle(0x060e14, 0.92);
    gfx.fillRoundedRect(x, y, w, h, 14);
    gfx.fillStyle(0x00c853, 0.25);
    gfx.fillRoundedRect(x, y, w, Math.round(h * 0.08), 14);
    gfx.lineStyle(1, 0x1e5a2a, 1);
    gfx.strokeRoundedRect(x, y, w, h, 14);
    this.objects.push(gfx);

    this.objects.push(this.add.text(x + w / 2, y + Math.round(13 * s),
      'BANK  —  auf Slot ziehen', {
        fontSize: fs(9), fontFamily: 'Oswald, Arial', color: '#2a7a3a',
      }).setOrigin(0.5));

    const bench = this._benchPlayers(roster);
    const ORDER = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
    bench.sort((a, b) => (ORDER[a.pos] ?? 9) - (ORDER[b.pos] ?? 9) || rating(b) - rating(a));

    const rowH   = Math.round(44 * s);
    const startY = y + Math.round(30 * s);

    bench.forEach((pl, i) => {
      const ry = startY + i * rowH;
      if (ry + rowH > y + h - Math.round(4 * s)) return;

      const col = POS_COL[pl.pos] ?? 0x888888;
      const r   = rating(pl);

      const rg = this.add.graphics();
      rg.fillStyle(0x0a1c0c, 1);
      rg.fillRoundedRect(x + Math.round(8 * s), ry, w - Math.round(16 * s), rowH - Math.round(4 * s), 6);
      this.objects.push(rg);

      const pb = this.add.graphics();
      pb.fillStyle(col, 1);
      pb.fillRoundedRect(x + Math.round(12 * s), ry + Math.round(10 * s),
        Math.round(32 * s), Math.round(18 * s), 4);
      this.objects.push(pb);
      this.objects.push(this.add.text(x + Math.round(28 * s), ry + Math.round(19 * s), pl.pos, {
        fontSize: fs(10), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#000',
      }).setOrigin(0.5));

      this.objects.push(this.add.text(x + Math.round(50 * s), ry + Math.round(9 * s), pl.name, {
        fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
        color: pl.isDefault ? '#5a7a5a' : '#fff',
      }));
      if (!pl.isDefault) {
        this.objects.push(this.add.text(x + Math.round(50 * s), ry + Math.round(26 * s),
          `⚔${pl.atk}  🛡${pl.def}  ⚡${pl.spd}`, {
            fontSize: fs(9), fontFamily: 'Rajdhani, Arial', color: '#666',
          }));
        const rCol = r >= 70 ? '#ffd600' : '#aaa';
        this.objects.push(this.add.text(x + w - Math.round(14 * s),
          ry + Math.round(rowH / 2 - 7 * s), `★ ${r}`, {
            fontSize: fs(13), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: rCol,
          }).setOrigin(1, 0));
      }

      const zone = this.add.zone(x + Math.round(8 * s), ry,
        w - Math.round(16 * s), rowH - Math.round(4 * s)
      ).setOrigin(0).setInteractive({ cursor: 'grab' });
      zone.on('pointerover', () => { rg.clear(); rg.fillStyle(0x142814, 1); rg.fillRoundedRect(x + Math.round(8 * s), ry, w - Math.round(16 * s), rowH - Math.round(4 * s), 6); });
      zone.on('pointerout',  () => { rg.clear(); rg.fillStyle(0x0a1c0c, 1); rg.fillRoundedRect(x + Math.round(8 * s), ry, w - Math.round(16 * s), rowH - Math.round(4 * s), 6); });
      zone.on('pointerdown', ptr => this._startDragFromList(pl, ptr));
      this.objects.push(zone);
    });

    if (!bench.length) {
      this.objects.push(this.add.text(x + w / 2, y + h / 2,
        'Alle Spieler\naufgestellt ✓', {
          fontSize: fs(12), fontFamily: 'Oswald, Arial', color: '#2a5a2a', align: 'center',
        }).setOrigin(0.5));
    }
  }

  // ── Drag ───────────────────────────────────────────────────────────────────
  _startDragFromPitch(slotIdx, player, ptr) {
    this._dragSource = { type: 'pitch', slotIdx, player };
    this._createGhost(player, ptr.x, ptr.y);
  }

  _startDragFromList(player, ptr) {
    this._dragSource = { type: 'list', player };
    this._createGhost(player, ptr.x, ptr.y);
  }

  _createGhost(pl, x, y) {
    const s   = this._s ?? 1;
    const fs  = n => `${Math.round(n * s)}px`;
    const col = POS_COL[pl.pos] ?? 0x888888;
    const gW  = Math.round(88 * s);
    const gH  = Math.round(74 * s);

    const g = this.add.graphics().setDepth(100);
    g.fillStyle(0x061008, 0.90);
    g.fillRoundedRect(x - gW / 2, y - gH / 2, gW, gH, 8);
    g.lineStyle(2, col, 1);
    g.strokeRoundedRect(x - gW / 2, y - gH / 2, gW, gH, 8);

    const t1 = this.add.text(x, y - Math.round(8 * s), pl.name.split(' ').pop(), {
      fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#fff',
    }).setOrigin(0.5).setDepth(101);
    const t2 = this.add.text(x, y + Math.round(12 * s),
      pl.isDefault ? '—' : `★ ${rating(pl)}`, {
        fontSize: fs(10), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
        color: pl.isDefault ? '#888' : '#ffd600',
      }).setOrigin(0.5).setDepth(101);

    this._ghost     = [g, t1, t2];
    this._ghostMeta = { gW, gH, col };
  }

  _onDragMove(ptr) {
    if (!this._dragSource || !this._ghost.length) return;
    const { gW, gH, col } = this._ghostMeta ?? {};
    const s    = this._s ?? 1;
    const pl   = this._dragSource.player;
    const over = this._slotUnder(ptr.x, ptr.y);

    const [g, t1, t2] = this._ghost;
    if (g?.active) {
      g.clear();
      g.fillStyle(over ? 0x003a15 : 0x061008, over ? 1 : 0.90);
      g.fillRoundedRect(ptr.x - gW / 2, ptr.y - gH / 2, gW, gH, 8);
      const hCol = over
        ? (this._slots[over.slotIdx].pos === pl.pos ? 0x00e676 : 0xff9800)
        : col;
      g.lineStyle(2, hCol, 1);
      g.strokeRoundedRect(ptr.x - gW / 2, ptr.y - gH / 2, gW, gH, 8);
    }
    if (t1?.active) t1.setPosition(ptr.x, ptr.y - Math.round(8 * s));
    if (t2?.active) t2.setPosition(ptr.x, ptr.y + Math.round(12 * s));

    if (this._hoverGfx?.active) {
      this._hoverGfx.clear();
      if (over) {
        const posMatch = this._slots[over.slotIdx].pos === pl.pos;
        const hcol = posMatch ? 0x00e676 : 0xff9800;
        this._hoverGfx.lineStyle(Math.round(2.5 * s), hcol, 0.9);
        this._hoverGfx.strokeRoundedRect(
          over.cx - over.slotW / 2, over.cy - over.slotH / 2, over.slotW, over.slotH, 8);
        this._hoverGfx.fillStyle(hcol, 0.08);
        this._hoverGfx.fillRoundedRect(
          over.cx - over.slotW / 2, over.cy - over.slotH / 2, over.slotW, over.slotH, 8);
      }
    }
  }

  _onDragEnd(ptr) {
    if (!this._dragSource) return;
    const src  = this._dragSource;
    const pl   = src.player;
    const over = this._slotUnder(ptr.x, ptr.y);

    this._destroyGhost();
    if (this._hoverGfx?.active) this._hoverGfx.clear();
    this._dragSource = null;

    if (!over) return;

    const targetSlot = this._slots[over.slotIdx];

    if (src.type === 'pitch') {
      if (src.slotIdx === over.slotIdx) return;
      const displaced      = targetSlot.player;
      targetSlot.player    = pl;
      this._slots[src.slotIdx].player = displaced ?? null;
    } else {
      targetSlot.player = pl;
    }

    this.redraw();
  }

  _slotUnder(px, py) {
    const s   = this._s ?? 1;
    const pad = Math.round(14 * s);
    let best = null, bestDist = Infinity;
    this._slotMeta.forEach(meta => {
      const inX = px >= meta.cx - meta.slotW / 2 - pad && px <= meta.cx + meta.slotW / 2 + pad;
      const inY = py >= meta.cy - meta.slotH / 2 - pad && py <= meta.cy + meta.slotH / 2 + pad;
      if (!inX || !inY) return;
      const dist = Math.abs(px - meta.cx) + Math.abs(py - meta.cy);
      if (dist < bestDist) { best = meta; bestDist = dist; }
    });
    return best;
  }

  _destroyGhost() {
    this._ghost.forEach(o => { try { o?.destroy(); } catch (_) {} });
    this._ghost = []; this._ghostMeta = null;
  }

  // ── Bottom bar ─────────────────────────────────────────────────────────────
  _drawBottomBar(y, W, h, s) {
    const fs    = n => `${Math.round(n * s)}px`;
    const valid = this._isValid();
    const count = this._slots.filter(sl => sl.player).length;
    const total = this._slots.length;

    const bg = this.add.graphics();
    bg.fillStyle(0x061008, 0.95);
    bg.fillRect(0, y, W, h);
    bg.fillStyle(0x1e3a24, 1);
    bg.fillRect(0, y, W, 1);
    this.objects.push(bg);

    const f       = FORMATIONS.find(x => x.id === this._formation) ?? FORMATIONS[0];
    const statusCol = valid ? 0x00c853 : 0xf39c12;
    const statusTxt = valid
      ? `✅  Startelf vollständig  (${count} / ${total})`
      : `⚠  ${count} / ${total}  —  TW×${f.slots.GK}  ABW×${f.slots.DEF}  MIT×${f.slots.MID}  STU×${f.slots.FWD}`;

    const sgW = Math.round(660 * s);
    const sg  = this.add.graphics();
    sg.fillStyle(valid ? 0x003a15 : 0x2a1a00, 1);
    sg.fillRoundedRect(Math.round(16 * s), y + Math.round(10 * s), sgW, Math.round(44 * s), 8);
    sg.lineStyle(1, statusCol, 0.55);
    sg.strokeRoundedRect(Math.round(16 * s), y + Math.round(10 * s), sgW, Math.round(44 * s), 8);
    this.objects.push(sg);
    this.objects.push(this.add.text(Math.round(16 * s) + sgW / 2, y + Math.round(32 * s), statusTxt, {
      fontSize: fs(11), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
      color: '#' + statusCol.toString(16).padStart(6, '0'),
    }).setOrigin(0.5));

    const btnW  = Math.round(240 * s);
    const btnH  = Math.round(44 * s);
    const btnX  = W - Math.round(16 * s) - btnW;
    const btnY  = y + Math.round(10 * s);
    const btnCol = valid ? 0x00c853 : 0x1a3a1a;

    const btnG = this.add.graphics();
    btnG.fillStyle(btnCol, 1);
    btnG.fillRoundedRect(btnX, btnY, btnW, btnH, 8);
    this.objects.push(btnG);
    this.objects.push(this.add.text(btnX + btnW / 2, btnY + btnH / 2, '➡  Zur Vorbereitung', {
      fontSize: fs(14), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
      color: valid ? '#000' : '#2a4a2a',
    }).setOrigin(0.5));

    if (valid) {
      const zone = this.add.zone(btnX, btnY, btnW, btnH).setOrigin(0).setInteractive({ cursor: 'pointer' });
      zone.on('pointerover',  () => { btnG.clear(); btnG.fillStyle(0x00e676, 1); btnG.fillRoundedRect(btnX, btnY, btnW, btnH, 8); });
      zone.on('pointerout',   () => { btnG.clear(); btnG.fillStyle(btnCol,  1); btnG.fillRoundedRect(btnX, btnY, btnW, btnH, 8); });
      zone.on('pointerdown',  () => {
        SocketClient.emit('submit_lineup', {
          lineup:          this._lineupFromSlots(),
          slotAssignments: this._slotAssignments(),
          formation:       this._formation,
        });
        this.scene.start('MatchdayPrepScene');
      });
      this.objects.push(zone);
    }
  }

  // ── Shutdown ───────────────────────────────────────────────────────────────
  _onShutdown() {
    this._destroyGhost();
    if (this._hoverGfx) { try { this._hoverGfx.destroy(); } catch (_) {} this._hoverGfx = null; }
    this.input.off('pointermove');
    this.input.off('pointerup');
    this.scale.off('resize', this.redraw, this);
    this.unsubs.forEach(u => u?.());
    this.objects.forEach(o => { try { o?.destroy(); } catch (_) {} });
  }

  shutdown() { this._onShutdown(); }
}
