import { SocketClient }                 from '../network/SocketClient.js';
import { addStadiumBg, preloadStadium } from '../ui/SceneBackground.js';

const POS_COLOR = { TW: 0x00b8d4, IV: 0x2979ff, MF: 0x00c853, ST: 0xff5252 };

export class TransferScene extends Phaser.Scene {
  constructor() { super('TransferScene'); }

  preload() { preloadStadium(this); }

  create() {
    this.objects   = [];
    this.unsubs    = [];
    this.tab       = 'buy';
    this.submitted = false;

    this.scale.on('resize', () => this.redraw(), this);
    this.events.on('shutdown', () => this._onShutdown(), this);

    this.unsubs.push(SocketClient.on('private_state',          () => this.redraw()));
    this.unsubs.push(SocketClient.on('transfer_update',        () => this.redraw()));
    this.unsubs.push(SocketClient.on('transfer_player_ready', (d) => {
      if (SocketClient.publicState) {
        SocketClient.publicState.transferReadyCount = d.readyCount;
      }
      this.redraw();
    }));
    this.unsubs.push(SocketClient.on('phase_changed', ({ phase }) => {
      if (phase === 'prep') this.scene.start('MatchdayPrepScene');
    }));

    this.redraw();
  }

  redraw() {
    this.objects.forEach(o => { try { o?.destroy(); } catch (_) {} });
    this.objects = [];

    const W  = this.scale.width, H = this.scale.height;
    const s  = Math.min(W / 1280, H / 720);
    const CX = W / 2;
    const fs = n => `${Math.round(n * s)}px`;

    const pub  = SocketClient.publicState;
    const priv = SocketClient.privateState;
    const me   = SocketClient.me;

    // ── Background ──────────────────────────────────────────────────────────
    addStadiumBg(this, this.objects, W, H);

    // ── Header ─────────────────────────────────────────────────────────────
    this.objects.push(this.add.text(CX, Math.round(22 * s),
      '🔄  TRANSFERFENSTER', {
        fontSize: fs(26), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#fff',
      }).setOrigin(0.5));

    this.objects.push(this.add.text(CX, Math.round(52 * s),
      'Alle Spieler können gleichzeitig transferieren · Klicke Fertig wenn du done bist.', {
        fontSize: fs(11), fontFamily: 'Rajdhani, Arial', color: '#5a8a5a',
      }).setOrigin(0.5));

    if (me) {
      this.objects.push(this.add.text(CX, Math.round(70 * s),
        `💰 Budget: ${me.budget}M  ·  Kader: ${me.rosterSize ?? '?'} Spieler`, {
          fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ffd600',
        }).setOrigin(0.5));
    }

    // ── Tab bar ────────────────────────────────────────────────────────────
    const tabY  = Math.round(86 * s);
    const tabH  = Math.round(36 * s);
    const tabW  = Math.round(180 * s);
    const tabs  = [['buy', '📥 Kaufen'], ['sell', '📤 Verkaufen']];
    const tabsX = CX - (tabs.length * tabW + (tabs.length - 1) * Math.round(8 * s)) / 2;

    tabs.forEach(([id, label], i) => {
      const tx  = tabsX + i * (tabW + Math.round(8 * s));
      const tg  = this.add.graphics();
      const act = this.tab === id;
      tg.fillStyle(act ? 0x00152a : 0x060e14, 1);
      tg.fillRoundedRect(tx, tabY, tabW, tabH, 8);
      tg.lineStyle(act ? 2 : 1, act ? 0x2979ff : 0x1a2a1a, 1);
      tg.strokeRoundedRect(tx, tabY, tabW, tabH, 8);
      this.objects.push(tg);
      this.objects.push(this.add.text(tx + tabW / 2, tabY + tabH / 2, label, {
        fontSize: fs(13), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
        color: act ? '#82b1ff' : '#3a6a3a',
      }).setOrigin(0.5));
      const tz = this.add.zone(tx, tabY, tabW, tabH).setOrigin(0).setInteractive({ cursor: 'pointer' });
      tz.on('pointerdown', () => { this.tab = id; this.redraw(); });
      this.objects.push(tz);
    });

    // ── Content area ────────────────────────────────────────────────────────
    const botH   = Math.round(64 * s);
    const contY  = tabY + tabH + Math.round(8 * s);
    const contH  = H - contY - botH - Math.round(8 * s);

    if (this.tab === 'buy')  this._drawBuyTab(pub, me, CX, contY, contH, W, s, fs);
    if (this.tab === 'sell') this._drawSellTab(priv, CX, contY, contH, W, s, fs);

    // ── Bottom bar: ready ───────────────────────────────────────────────────
    const barY      = H - botH;
    const readyCount = pub?.transferReadyCount ?? 0;
    const total      = pub?.totalCount ?? (pub?.players?.length ?? 0);

    const barG = this.add.graphics();
    barG.fillStyle(0x060e14, 0.97); barG.fillRect(0, barY, W, botH);
    barG.fillStyle(0x1e3a24, 1);   barG.fillRect(0, barY, W, 1);
    this.objects.push(barG);

    this.objects.push(this.add.text(Math.round(20 * s), barY + botH / 2,
      `✅ Fertig: ${readyCount} / ${total}`, {
        fontSize: fs(14), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#00e676',
      }).setOrigin(0, 0.5));

    const bW  = Math.round(240 * s);
    const bH  = Math.round(42 * s);
    const bX  = W - bW - Math.round(20 * s);
    const bY2 = barY + (botH - bH) / 2;
    const done = this.submitted;
    const bG  = this.add.graphics();
    bG.fillStyle(done ? 0x1e3a24 : 0x00c853, 1);
    bG.fillRoundedRect(bX, bY2, bW, bH, 8);
    this.objects.push(bG);
    this.objects.push(this.add.text(bX + bW / 2, bY2 + bH / 2,
      done ? '⏳ Warte auf andere…' : '✓  FERTIG', {
        fontSize: fs(14), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
        color: done ? '#3a6a3a' : '#000',
      }).setOrigin(0.5));
    if (!done) {
      const dz = this.add.zone(bX, bY2, bW, bH).setOrigin(0).setInteractive({ cursor: 'pointer' });
      dz.on('pointerover',  () => { bG.clear(); bG.fillStyle(0x00e676, 1); bG.fillRoundedRect(bX, bY2, bW, bH, 8); });
      dz.on('pointerout',   () => { bG.clear(); bG.fillStyle(0x00c853, 1); bG.fillRoundedRect(bX, bY2, bW, bH, 8); });
      dz.on('pointerdown',  () => { this.submitted = true; SocketClient.emit('transfer_ready'); this.redraw(); });
      this.objects.push(dz);
    }
  }

  // ── Buy Tab ────────────────────────────────────────────────────────────────
  _drawBuyTab(pub, me, CX, contY, contH, W, s, fs) {
    const available = pub?.availableTransferPlayers ?? [];
    const myBudget  = me?.budget ?? 0;

    this.objects.push(this.add.text(CX, contY + Math.round(8 * s),
      `${available.length} Spieler auf dem Markt · Klicken zum Kaufen`, {
        fontSize: fs(11), fontFamily: 'Rajdhani, Arial', color: '#3a6a3a',
      }).setOrigin(0.5));

    if (available.length === 0) {
      this.objects.push(this.add.text(CX, contY + contH / 2, 'Kein Spieler mehr verfügbar.', {
        fontSize: fs(20), fontFamily: 'Oswald, Arial', color: '#2a4a3a',
      }).setOrigin(0.5));
      return;
    }

    const cols  = Math.max(2, Math.min(5, Math.floor(W / Math.round(240 * s))));
    const cardW = Math.round((W - Math.round(20 * s) * (cols + 1)) / cols);
    const cardH = Math.round(Math.min(110 * s, (contH - Math.round(30 * s)) / Math.ceil(available.length / cols) - Math.round(8 * s)));
    const startX = Math.round(10 * s);
    const gap    = Math.round(10 * s);
    const listY  = contY + Math.round(28 * s);

    available.slice(0, cols * 4).forEach((pl, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx  = startX + col * (cardW + gap);
      const cy  = listY + row * (cardH + gap);
      if (cy + cardH > contY + contH) return;

      const canAfford = myBudget >= pl.val;
      const posCol    = POS_COLOR[pl.pos] ?? 0x2979ff;
      const accent    = canAfford ? posCol : 0x1a2a1a;

      const g = this.add.graphics();
      // Glow
      for (let i2 = 4; i2 >= 1; i2--) {
        const sh = i2 * Math.round(2 * s);
        g.fillStyle(accent, canAfford ? 0.018 * i2 : 0.008);
        g.fillRoundedRect(cx - sh, cy - sh, cardW + sh * 2, cardH + sh * 2, 12 + sh);
      }
      g.fillStyle(0x060e14, canAfford ? 0.95 : 0.85);
      g.fillRoundedRect(cx, cy, cardW, cardH, 12);
      g.fillStyle(accent, canAfford ? 0.30 : 0.10);
      g.fillRoundedRect(cx, cy, cardW, Math.round(cardH * 0.38), 12);
      g.lineStyle(1.5, accent, canAfford ? 0.9 : 0.3);
      g.strokeRoundedRect(cx, cy, cardW, cardH, 12);
      this.objects.push(g);

      // Position badge
      const pb = this.add.graphics();
      pb.fillStyle(posCol, canAfford ? 1 : 0.3);
      pb.fillRoundedRect(cx + Math.round(6 * s), cy + Math.round(6 * s),
        Math.round(36 * s), Math.round(18 * s), { tl: 8, tr: 4, bl: 4, br: 8 });
      this.objects.push(pb);
      this.objects.push(this.add.text(cx + Math.round(24 * s), cy + Math.round(15 * s), pl.pos, {
        fontSize: fs(10), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
        color: canAfford ? '#000' : '#223',
      }).setOrigin(0.5));

      // Name
      this.objects.push(this.add.text(cx + cardW / 2, cy + Math.round(16 * s), pl.name, {
        fontSize: fs(13), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
        color: canAfford ? '#fff' : '#2a4a3a',
      }).setOrigin(0.5));

      // Stats
      this.objects.push(this.add.text(cx + cardW / 2, cy + Math.round(36 * s),
        `⚔ ${pl.atk}  🛡 ${pl.def}  ⚡ ${pl.spd}`, {
          fontSize: fs(10), fontFamily: 'Rajdhani, Arial', color: canAfford ? '#5a8a5a' : '#1a3a2a',
        }).setOrigin(0.5));

      // Price
      this.objects.push(this.add.text(cx + cardW / 2, cy + Math.round(56 * s), `💰 ${pl.val}M`, {
        fontSize: fs(15), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
        color: canAfford ? '#ffd600' : '#2a3a2a',
      }).setOrigin(0.5));

      // Trait
      if (pl.trait) {
        this.objects.push(this.add.text(cx + cardW / 2, cy + Math.round(74 * s), `★ ${pl.trait}`, {
          fontSize: fs(9), fontFamily: 'Rajdhani, Arial', color: canAfford ? '#9c27b0' : '#1a2a1a',
        }).setOrigin(0.5));
      }

      // Insufficient budget label
      if (!canAfford) {
        this.objects.push(this.add.text(cx + cardW / 2, cy + cardH - Math.round(10 * s), 'Kein Budget', {
          fontSize: fs(8), fontFamily: 'Rajdhani, Arial', color: '#1a3a2a',
        }).setOrigin(0.5));
      }

      if (canAfford) {
        const zone = this.add.zone(cx, cy, cardW, cardH).setOrigin(0).setInteractive({ cursor: 'pointer' });
        zone.on('pointerdown', () => SocketClient.emit('buy_player', { playerId: pl.id }));
        zone.on('pointerover', () => {
          g.clear();
          for (let i2 = 4; i2 >= 1; i2--) {
            const sh = i2 * Math.round(2 * s);
            g.fillStyle(0x00e676, 0.025 * i2);
            g.fillRoundedRect(cx - sh, cy - sh, cardW + sh * 2, cardH + sh * 2, 12 + sh);
          }
          g.fillStyle(0x0a2010, 1); g.fillRoundedRect(cx, cy, cardW, cardH, 12);
          g.fillStyle(0x00c853, 0.35); g.fillRoundedRect(cx, cy, cardW, Math.round(cardH * 0.38), 12);
          g.lineStyle(2, 0x00e676, 1); g.strokeRoundedRect(cx, cy, cardW, cardH, 12);
        });
        zone.on('pointerout', () => {
          g.clear();
          for (let i2 = 4; i2 >= 1; i2--) {
            const sh = i2 * Math.round(2 * s);
            g.fillStyle(accent, 0.018 * i2);
            g.fillRoundedRect(cx - sh, cy - sh, cardW + sh * 2, cardH + sh * 2, 12 + sh);
          }
          g.fillStyle(0x060e14, 0.95); g.fillRoundedRect(cx, cy, cardW, cardH, 12);
          g.fillStyle(accent, 0.30); g.fillRoundedRect(cx, cy, cardW, Math.round(cardH * 0.38), 12);
          g.lineStyle(1.5, accent, 0.9); g.strokeRoundedRect(cx, cy, cardW, cardH, 12);
        });
        this.objects.push(zone);
      }
    });
  }

  // ── Sell Tab ───────────────────────────────────────────────────────────────
  _drawSellTab(priv, CX, contY, contH, W, s, fs) {
    const roster = priv?.roster ?? [];

    this.objects.push(this.add.text(CX, contY + Math.round(8 * s),
      'Spieler verkaufen — du bekommst 80% des Marktwerts', {
        fontSize: fs(11), fontFamily: 'Rajdhani, Arial', color: '#3a6a3a',
      }).setOrigin(0.5));

    if (roster.length === 0) {
      this.objects.push(this.add.text(CX, contY + contH / 2, 'Kein Spieler im Kader.', {
        fontSize: fs(20), fontFamily: 'Oswald, Arial', color: '#2a4a3a',
      }).setOrigin(0.5));
      return;
    }

    const cols  = Math.max(2, Math.min(5, Math.floor(W / Math.round(240 * s))));
    const cardW = Math.round((W - Math.round(20 * s) * (cols + 1)) / cols);
    const cardH = Math.round(Math.min(88 * s, (contH - Math.round(30 * s)) / Math.ceil(roster.length / cols) - Math.round(8 * s)));
    const startX = Math.round(10 * s);
    const gap    = Math.round(10 * s);
    const listY  = contY + Math.round(28 * s);

    roster.forEach((pl, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx  = startX + col * (cardW + gap);
      const cy  = listY + row * (cardH + gap);
      if (cy + cardH > contY + contH) return;

      const sellPrice = Math.floor(pl.val * 0.8);
      const inLineup  = (priv?.lineup ?? []).includes(pl.id);
      const posCol    = POS_COLOR[pl.pos] ?? 0x2979ff;
      const accent    = inLineup ? 0xffd600 : 0xff5252;

      const g = this.add.graphics();
      for (let i2 = 4; i2 >= 1; i2--) {
        const sh = i2 * Math.round(2 * s);
        g.fillStyle(accent, 0.015 * i2);
        g.fillRoundedRect(cx - sh, cy - sh, cardW + sh * 2, cardH + sh * 2, 12 + sh);
      }
      g.fillStyle(0x060e14, 0.95);
      g.fillRoundedRect(cx, cy, cardW, cardH, 12);
      g.fillStyle(accent, 0.22);
      g.fillRoundedRect(cx, cy, cardW, Math.round(cardH * 0.40), 12);
      g.lineStyle(1.5, accent, 0.7);
      g.strokeRoundedRect(cx, cy, cardW, cardH, 12);
      this.objects.push(g);

      // Position badge
      const pb = this.add.graphics();
      pb.fillStyle(posCol, 1);
      pb.fillRoundedRect(cx + Math.round(6 * s), cy + Math.round(5 * s),
        Math.round(32 * s), Math.round(17 * s), { tl: 8, tr: 4, bl: 4, br: 8 });
      this.objects.push(pb);
      this.objects.push(this.add.text(cx + Math.round(22 * s), cy + Math.round(13 * s), pl.pos, {
        fontSize: fs(10), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#000',
      }).setOrigin(0.5));

      // Name
      this.objects.push(this.add.text(cx + cardW / 2, cy + Math.round(15 * s), pl.name, {
        fontSize: fs(13), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#fff',
      }).setOrigin(0.5));

      // Stats row
      this.objects.push(this.add.text(cx + Math.round(10 * s), cy + Math.round(37 * s),
        `⚔ ${pl.atk}  🛡 ${pl.def}  ⚡ ${pl.spd ?? '–'}`, {
          fontSize: fs(10), fontFamily: 'Rajdhani, Arial', color: '#5a7a5a',
        }));

      // Sell price
      this.objects.push(this.add.text(cx + cardW - Math.round(10 * s), cy + Math.round(37 * s),
        `💰 ${sellPrice}M`, {
          fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ffd600',
        }).setOrigin(1, 0));

      // Starter badge
      if (inLineup) {
        this.objects.push(this.add.text(cx + cardW / 2, cy + Math.round(60 * s), '★ Starter', {
          fontSize: fs(9), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ffd600',
        }).setOrigin(0.5));
      }

      // Sell zone
      const zone = this.add.zone(cx, cy, cardW, cardH).setOrigin(0).setInteractive({ cursor: 'pointer' });
      zone.on('pointerdown', () => SocketClient.emit('sell_player', { playerId: pl.id }));
      zone.on('pointerover', () => {
        g.clear();
        for (let i2 = 4; i2 >= 1; i2--) {
          const sh = i2 * Math.round(2 * s);
          g.fillStyle(0xff5252, 0.025 * i2);
          g.fillRoundedRect(cx - sh, cy - sh, cardW + sh * 2, cardH + sh * 2, 12 + sh);
        }
        g.fillStyle(0x2a0a0a, 1); g.fillRoundedRect(cx, cy, cardW, cardH, 12);
        g.fillStyle(0xff5252, 0.30); g.fillRoundedRect(cx, cy, cardW, Math.round(cardH * 0.40), 12);
        g.lineStyle(2, 0xff5252, 1); g.strokeRoundedRect(cx, cy, cardW, cardH, 12);
      });
      zone.on('pointerout', () => {
        g.clear();
        for (let i2 = 4; i2 >= 1; i2--) {
          const sh = i2 * Math.round(2 * s);
          g.fillStyle(accent, 0.015 * i2);
          g.fillRoundedRect(cx - sh, cy - sh, cardW + sh * 2, cardH + sh * 2, 12 + sh);
        }
        g.fillStyle(0x060e14, 0.95); g.fillRoundedRect(cx, cy, cardW, cardH, 12);
        g.fillStyle(accent, 0.22); g.fillRoundedRect(cx, cy, cardW, Math.round(cardH * 0.40), 12);
        g.lineStyle(1.5, accent, 0.7); g.strokeRoundedRect(cx, cy, cardW, cardH, 12);
      });
      this.objects.push(zone);
    });
  }

  _onShutdown() {
    this.scale.off('resize', this.redraw, this);
    this.unsubs.forEach(u => u());
    this.objects.forEach(o => { try { o?.destroy(); } catch (_) {} });
  }

  shutdown() { this._onShutdown(); }
}
