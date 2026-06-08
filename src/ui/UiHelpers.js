// ─────────────────────────────────────────────────────────────────────────────
// UiHelpers.js  —  Football-themed Phaser 3 UI system
// ─────────────────────────────────────────────────────────────────────────────

// ── Colour palette ────────────────────────────────────────────────────────────
export const C = {
  // Base
  BG:       0x060c08,
  PITCH:    0x071209,
  PANEL:    0x0c1e10,
  PANEL2:   0x112518,
  BORDER:   0x1e4a28,
  BORDER2:  0x2d6b3c,

  // Accents
  GREEN:    0x00e676,   // bright grass green  (SUCCESS alias)
  GOLD:     0xffd600,   // stadium gold        (WARN alias)
  RED:      0xf44336,   // red card            (ACCENT alias)
  BLUE:     0x42a5f5,

  // Aliases (old names still work)
  SUCCESS:  0x00e676,
  WARN:     0xffd600,
  ACCENT:   0xf44336,
  MUT:      0x2a4030,
  WHITE:    0xffffff,
  GREY:     0x8aab8e,

  // Position colours
  POS: { GK: 0xf39c12, DEF: 0x27ae60, MID: 0x3498db, FWD: 0xe74c3c },

  // Font stacks
  FONT_HEAD: 'Oswald, Segoe UI, Arial',
  FONT_UI:   'Rajdhani, Segoe UI, Arial',
};

// ── Live layout helper ────────────────────────────────────────────────────────
export function L(scene) {
  const W  = scene.scale.width;
  const H  = scene.scale.height;
  const CX = W / 2;
  const CY = H / 2;
  const s  = Math.min(W / 1280, H / 720);
  const pad = Math.round(20 * s);
  return { W, H, CX, CY, s, pad };
}

// Backwards-compat getters
Object.defineProperty(C, 'W',  { get: () => window.innerWidth,       configurable: true });
Object.defineProperty(C, 'H',  { get: () => window.innerHeight,      configurable: true });
Object.defineProperty(C, 'CX', { get: () => window.innerWidth  / 2,  configurable: true });
Object.defineProperty(C, 'CY', { get: () => window.innerHeight / 2,  configurable: true });

// ── Pitch background ──────────────────────────────────────────────────────────
export function makePitchBg(scene) {
  const { W, H, CX, CY, s } = L(scene);
  const g = scene.add.graphics();

  // Turf stripes (subtle alternating bands)
  const stripes = 10;
  const sh = H / stripes;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle(i % 2 === 0 ? 0x060c08 : 0x071209, 1);
    g.fillRect(0, i * sh, W, sh);
  }

  // Pitch markings — very subtle white lines
  g.lineStyle(Math.max(1, Math.round(s)), 0xffffff, 0.07);

  const pW = W * 0.82, pH = H * 0.75;
  const pX = (W - pW) / 2, pY = (H - pH) / 2;

  // Outer boundary
  g.strokeRect(pX, pY, pW, pH);

  // Half-way line
  g.lineBetween(CX, pY, CX, pY + pH);

  // Centre circle
  g.strokeCircle(CX, CY, Math.min(pW, pH) * 0.14);

  // Centre spot
  g.fillStyle(0xffffff, 0.12);
  g.fillCircle(CX, CY, Math.round(4 * s));

  // Penalty boxes
  const pbW = pW * 0.16, pbH = pH * 0.40;
  const pbY = pY + (pH - pbH) / 2;
  g.lineStyle(Math.max(1, Math.round(s)), 0xffffff, 0.07);
  g.strokeRect(pX, pbY, pbW, pbH);
  g.strokeRect(pX + pW - pbW, pbY, pbW, pbH);

  // Goal areas
  const gaW = pW * 0.07, gaH = pH * 0.20;
  const gaY = pY + (pH - gaH) / 2;
  g.strokeRect(pX, gaY, gaW, gaH);
  g.strokeRect(pX + pW - gaW, gaY, gaW, gaH);

  // Corner arcs (quarter circles)
  g.lineStyle(Math.max(1, Math.round(s)), 0xffffff, 0.06);
  const cr = Math.round(18 * s);
  [[pX, pY], [pX + pW, pY], [pX, pY + pH], [pX + pW, pY + pH]].forEach(([cx2, cy2]) => {
    g.strokeCircle(cx2, cy2, cr);
  });

  // Vignette — dark overlay at edges for depth
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    g.fillStyle(0x000000, 0.055 * (1 - t));
    g.fillRect(0, 0, W * (0.25 - t * 0.03), H);
    g.fillRect(W - W * (0.25 - t * 0.03), 0, W * (0.25 - t * 0.03), H);
    g.fillRect(0, 0, W, H * (0.12 - t * 0.015));
    g.fillRect(0, H - H * (0.12 - t * 0.015), W, H * (0.12 - t * 0.015));
  }

  return g;
}

// Kept for backwards compat
export const makeBgGradient = makePitchBg;

// ── Panel helpers ─────────────────────────────────────────────────────────────
export function drawPanel(g, x, y, w, h,
    fillColor   = C.PANEL,
    strokeColor = C.BORDER,
    strokeWidth = 2,
    alpha       = 1,
    radius      = 10) {
  g.fillStyle(fillColor, alpha);
  g.fillRoundedRect(x, y, w, h, radius);
  if (strokeWidth > 0) {
    g.lineStyle(strokeWidth, strokeColor, 1);
    g.strokeRoundedRect(x, y, w, h, radius);
  }
}

// Sports-card panel with coloured header stripe
export function drawCardPanel(g, x, y, w, h, accentColor, label, scene) {
  // Body
  g.fillStyle(C.PANEL, 1);
  g.fillRoundedRect(x, y, w, h, 12);
  // Border
  g.lineStyle(2, accentColor, 1);
  g.strokeRoundedRect(x, y, w, h, 12);
  // Top accent stripe
  const { s } = L(scene);
  const stripeH = Math.round(6 * s);
  g.fillStyle(accentColor, 1);
  g.fillRect(x + 2, y + 2, w - 4, stripeH);
  g.fillStyle(accentColor, 0.15);
  g.fillRect(x + 2, y + 2, w - 4, Math.round(30 * s));
}

// ── Text helpers ──────────────────────────────────────────────────────────────
export function heading(scene, x, y, text, size = 36) {
  const { s } = L(scene);
  return scene.add.text(x, y, text, {
    fontSize:   `${Math.round(size * s)}px`,
    fontFamily: C.FONT_HEAD,
    fontStyle:  'bold',
    color:      '#ffffff',
  }).setOrigin(0.5);
}

export function sub(scene, x, y, text, size = 18, color = '#8aab8e') {
  const { s } = L(scene);
  return scene.add.text(x, y, text, {
    fontSize:   `${Math.round(size * s)}px`,
    fontFamily: C.FONT_UI,
    color,
  }).setOrigin(0.5);
}

// Uppercase label (Oswald, good for section headers)
export function label(scene, x, y, text, size = 13, color = '#8aab8e') {
  const { s } = L(scene);
  return scene.add.text(x, y, text.toUpperCase(), {
    fontSize:   `${Math.round(size * s)}px`,
    fontFamily: C.FONT_HEAD,
    letterSpacing: Math.round(2 * s),
    color,
  }).setOrigin(0.5);
}

// ── Button ────────────────────────────────────────────────────────────────────
export function makeButton(scene, x, y, w, h, text,
    color     = C.GREEN,
    textColor = 0x000000) {
  const { s } = L(scene);

  const g = scene.add.graphics();
  _drawBtn(g, x, y, w, h, color, false, s);

  const isLight = _luminance(color) > 0.35;
  const tCol = '#' + (isLight ? 0x000000 : 0xffffff).toString(16).padStart(6, '0');
  const txt = scene.add.text(x, y, text, {
    fontSize:   `${Math.round(15 * s)}px`,
    fontFamily: C.FONT_HEAD,
    fontStyle:  'bold',
    color:      tCol,
  }).setOrigin(0.5);

  const zone = scene.add.zone(x, y, w, h).setInteractive({ cursor: 'pointer' });
  zone.on('pointerover',  () => { g.clear(); _drawBtn(g, x, y, w, h, color, true, s);  });
  zone.on('pointerout',   () => { g.clear(); _drawBtn(g, x, y, w, h, color, false, s); });
  zone.on('pointerdown',  () => { scene.tweens.add({ targets: [g, txt], scaleX: 0.96, scaleY: 0.96, duration: 60, yoyo: true }); });

  return { g, txt, zone, destroy() { g.destroy(); txt.destroy(); zone.destroy(); } };
}

function _drawBtn(g, x, y, w, h, color, hover, s) {
  const radius = Math.round(8 * s);
  const bx = x - w / 2, by = y - h / 2;

  if (hover) {
    // Glow
    g.fillStyle(color, 0.15);
    g.fillRoundedRect(bx - 4, by - 4, w + 8, h + 8, radius + 4);
  }

  g.fillStyle(color, hover ? 1 : 0.9);
  g.fillRoundedRect(bx, by, w, h, radius);

  // Top highlight line
  g.lineStyle(1, 0xffffff, hover ? 0.35 : 0.2);
  g.lineBetween(bx + radius, by + 1, bx + w - radius, by + 1);
}

function _luminance(hex) {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8)  & 0xff) / 255;
  const b = ( hex        & 0xff) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ── Club badge (circle with emoji/initials) ───────────────────────────────────
export function makeClubBadge(scene, x, y, size, club) {
  const g = scene.add.graphics();
  // Outer ring
  g.lineStyle(Math.round(size * 0.06), club.color, 1);
  g.strokeCircle(x, y, size / 2);
  // Inner fill
  g.fillStyle(club.color, 0.15);
  g.fillCircle(x, y, size / 2 - 2);
  // Emoji
  scene.add.text(x, y, club.emoji ?? '⚽', {
    fontSize: `${Math.round(size * 0.5)}px`,
  }).setOrigin(0.5);
  return g;
}

// ── Stat bar ──────────────────────────────────────────────────────────────────
export function drawStatBar(scene, x, y, w, val, maxVal = 99, color = C.GREEN) {
  const g = scene.add.graphics();
  g.fillStyle(0x0a1f0d, 1);
  g.fillRoundedRect(x, y, w, 8, 4);
  const fill = Math.max(4, Math.min((val / maxVal) * w, w));
  g.fillStyle(color, 1);
  g.fillRoundedRect(x, y, fill, 8, 4);
  // Shine
  g.fillStyle(0xffffff, 0.15);
  g.fillRoundedRect(x, y, fill, 3, 2);
  return g;
}

// ── Player card ───────────────────────────────────────────────────────────────
export function makePlayerCard(scene, x, y, player, compact = false) {
  const { s } = L(scene);
  const W2 = Math.round((compact ? 180 : 220) * s);
  const H2 = Math.round((compact ? 110 : 160) * s);
  const posCol = C.POS[player.pos] ?? C.BORDER2;
  const fs = (n) => `${Math.round(n * s)}px`;

  const g = scene.add.graphics();
  g.fillStyle(C.PANEL, 1);
  g.fillRoundedRect(x, y, W2, H2, 10);
  g.lineStyle(2, posCol, 1);
  g.strokeRoundedRect(x, y, W2, H2, 10);
  // Accent stripe at top
  g.fillStyle(posCol, 1);
  g.fillRect(x + 2, y + 2, W2 - 4, Math.round(5 * s));
  g.fillStyle(posCol, 0.12);
  g.fillRect(x + 2, y + 2, W2 - 4, Math.round(26 * s));

  // Position badge
  const pb = scene.add.graphics();
  pb.fillStyle(posCol, 1);
  pb.fillRoundedRect(x + Math.round(6 * s), y + Math.round(10 * s),
    Math.round(34 * s), Math.round(18 * s), 4);
  scene.add.text(x + Math.round(23 * s), y + Math.round(19 * s), player.pos, {
    fontSize: fs(10), fontFamily: C.FONT_HEAD, fontStyle: 'bold', color: '#000',
  }).setOrigin(0.5);

  scene.add.text(x + W2 / 2, y + H2 * 0.24, player.name, {
    fontSize: fs(compact ? 13 : 15), fontFamily: C.FONT_HEAD, fontStyle: 'bold', color: '#fff',
  }).setOrigin(0.5);

  if (!compact) {
    const stats = [
      { label: 'ATK', val: player.atk, color: C.RED },
      { label: 'DEF', val: player.def, color: C.BLUE },
      { label: 'SPD', val: player.spd, color: C.GOLD },
    ];
    stats.forEach(({ label: lbl, val, color }, i) => {
      const sy = y + H2 * 0.38 + i * H2 * 0.18;
      scene.add.text(x + Math.round(10 * s), sy, lbl,
        { fontSize: fs(10), color: '#8aab8e', fontFamily: C.FONT_UI });
      scene.add.text(x + W2 - Math.round(8 * s), sy, String(val),
        { fontSize: fs(11), fontStyle: 'bold', color: '#fff', fontFamily: C.FONT_UI }).setOrigin(1, 0);
      drawStatBar(scene, x + Math.round(34 * s), sy + Math.round(2 * s),
        W2 - Math.round(52 * s), val, 99, color);
    });
    scene.add.text(x + W2 / 2, y + H2 * 0.88,
      `💰 ${player.val}M`, { fontSize: fs(12), color: '#ffd600', fontFamily: C.FONT_UI }).setOrigin(0.5);
    if (player.trait)
      scene.add.text(x + W2 / 2, y + H2 * 0.77,
        `★ ${player.trait}`, { fontSize: fs(10), color: '#ce93d8', fontFamily: C.FONT_UI }).setOrigin(0.5);
  } else {
    scene.add.text(x + W2 / 2, y + H2 * 0.52,
      `ATK ${player.atk}  DEF ${player.def}`, { fontSize: fs(11), color: '#8aab8e', fontFamily: C.FONT_UI }).setOrigin(0.5);
    scene.add.text(x + W2 / 2, y + H2 * 0.82,
      `💰 ${player.val}M`, { fontSize: fs(11), color: '#ffd600', fontFamily: C.FONT_UI }).setOrigin(0.5);
  }
  return g;
}

// ── Utility ───────────────────────────────────────────────────────────────────
export function lighten(color) {
  const r = Math.min(255, ((color >> 16) & 0xff) + 40);
  const g = Math.min(255, ((color >> 8)  & 0xff) + 40);
  const b = Math.min(255, ( color        & 0xff) + 40);
  return (r << 16) | (g << 8) | b;
}
export function posColor(pos) { return C.POS[pos] ?? C.GREY; }
