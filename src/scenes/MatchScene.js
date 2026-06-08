import { SocketClient }                 from '../network/SocketClient.js';
import { addStadiumBg, preloadStadium } from '../ui/SceneBackground.js';

// 90 game-minutes mapped to SIM_MS real milliseconds
const SIM_MS   = 90_000;   // 90 seconds total
const TICK_MS  = 200;      // update resolution

// Card effect display info
const CARD_INFO = {
  training:   { icon: '💪', name: 'Trainingsboost',    col: 0x00c853, desc: t => `${t ?? '?'}: +8 ATK` },
  formhigh:   { icon: '⭐', name: 'Hochform',           col: 0xffd600, desc: t => `${t ?? '?'}: +10 ATK/DEF` },
  derby:      { icon: '🔥', name: 'Derby-Faktor',       col: 0xff9800, desc: () => 'Team +6% Stärke' },
  homeadv:    { icon: '🏟', name: 'Heimvorteil',        col: 0x2979ff, desc: () => '+12 Stärke' },
  lastminute: { icon: '⏱', name: 'Last-Minute-Tor',    col: 0x00bcd4, desc: () => '60% Chance Extra-Tor' },
  gkwall:     { icon: '🧤', name: 'Torwartwall',        col: 0x4caf50, desc: t => `${t ?? 'TW'}: +15 DEF` },
  talent:     { icon: '📈', name: 'Talentschub',        col: 0x9c27b0, desc: t => `${t ?? '?'}: dauer. +4 ATK/DEF` },
  injury:     { icon: '🤕', name: 'Verletzung',         col: 0xe53935, desc: t => `${t ?? '?'}: geschwächt (-12)` },
  redcard:    { icon: '🟥', name: 'Rote Karte',         col: 0xff1744, desc: t => `${t ?? '?'}: gesperrt` },
  scandal:    { icon: '📰', name: 'Skandal',             col: 0x795548, desc: () => 'Gegner -10% Stärke' },
};

export class MatchScene extends Phaser.Scene {
  constructor() { super('MatchScene'); }

  preload() { preloadStadium(this); }

  init(data) { this._initData = data ?? null; }

  create() {
    this.objects      = [];
    this.unsubs       = [];
    this._phase       = 'waiting';   // 'cards' | 'simulating' | 'results'
    this._simData     = null;
    this._simTimer    = null;
    this._cardTimer   = null;
    this._simStartMs  = 0;
    this._shownKeys   = new Set();
    this._liveScores  = {};          // key → { home, away }
    this._eventHistory = [];         // for feed replay on resize

    // Dynamic refs (point into this.objects; cleared on _rebuildLayout)
    this._minuteText    = null;
    this._progressGfx   = null;
    this._progressBounds = null;
    this._scoreObjs     = {};        // key → Phaser.GameObjects.Text
    this._feedBounds    = null;      // { x,y,w,h,itemH,gap }
    this._feedCount     = 0;
    this._countdownText = null;

    this.scale.on('resize', () => this._onResize(), this);
    this.events.on('shutdown', () => this._onShutdown(), this);

    this.unsubs.push(SocketClient.on('matchday_results', d => {
      this._simData = d;
      this._launchSim();
    }));

    if (this._initData) {
      // Passed directly (DebugScene / scene.start with data)
      this._simData = this._initData;
      this._launchSim();
    } else {
      this._drawWaiting();
    }
  }

  // ── Launch: card reveal → countdown → simulation ─────────────────────────
  _launchSim() {
    // Init live scores for all matches (needed even during card phase)
    this._liveScores = {};
    (this._simData?.results ?? []).forEach(r => {
      this._liveScores[`${r.homeId}|${r.awayId}`] = { home: 0, away: 0 };
    });
    this._startCardReveal();
  }

  _startCardReveal() {
    this._phase = 'cards';
    this._rebuildLayout(); // draws card reveal screen + sets this._countdownText

    // Figure out how many cards to stagger
    const myId     = SocketClient.myPlayerId;
    const results  = this._simData?.results ?? [];
    const myResult = results.find(r => r.homeId === myId || r.awayId === myId);
    const isHome   = myResult?.homeId === myId;
    const myCards  = ((isHome ? myResult?.homeCardEffects : myResult?.awayCardEffects) ?? []);
    const oppCards = ((isHome ? myResult?.awayCardEffects : myResult?.homeCardEffects) ?? []);
    const totalCards = myCards.length + oppCards.length;

    // Delay: intro(400ms) + stagger(totalCards * 450ms) + hold(600ms) + countdown(3 × 1000ms)
    const revealMs  = 400 + totalCards * 450 + 600;
    let   countdown = 3;

    const tick = () => {
      if (this._countdownText) {
        this._countdownText.setText(
          countdown > 0 ? `Spiel startet in ${countdown}…` : 'Los geht\'s!'
        );
        // Pulse
        this.tweens.add({ targets: this._countdownText, scaleX: 1.18, scaleY: 1.18, duration: 200, yoyo: true, ease: 'Power2' });
      }
      countdown--;
      if (countdown < 0) {
        this._beginSim();
      } else {
        this._cardTimer = this.time.delayedCall(1000, tick);
      }
    };

    this._cardTimer = this.time.delayedCall(revealMs, tick);
  }

  _beginSim() {
    if (this._cardTimer) { this._cardTimer.remove(); this._cardTimer = null; }
    this._phase      = 'simulating';
    this._simStartMs = Date.now();
    this._shownKeys  = new Set();
    this._eventHistory = [];
    this._rebuildLayout();
    this._simTimer = this.time.addEvent({
      delay: TICK_MS, loop: true,
      callback: this._tick, callbackScope: this,
    });
  }

  // ── Simulation tick ───────────────────────────────────────────────────────
  _tick() {
    const elapsed  = Date.now() - this._simStartMs;
    const fraction = Math.min(elapsed / SIM_MS, 1);
    const minute   = Math.round(fraction * 90);

    // Minute counter
    if (this._minuteText) {
      this._minuteText.setText(minute >= 90 ? 'Abpfiff!' : `${minute}'`);
      this._minuteText.setColor(minute >= 80 ? '#ff5252' : minute >= 45 ? '#ffd600' : '#00e676');
    }

    // Progress bar
    if (this._progressGfx && this._progressBounds) {
      const { x, y, w, h } = this._progressBounds;
      const fill = Math.round(w * fraction);
      const col  = fraction < 0.5 ? 0x00c853 : fraction < 0.88 ? 0xffd600 : 0xff5252;
      this._progressGfx.clear();
      this._progressGfx.fillStyle(0x0a200e, 1);
      this._progressGfx.fillRoundedRect(x, y, w, h, h / 2);
      if (fill > 1) {
        this._progressGfx.fillStyle(col, 1);
        this._progressGfx.fillRoundedRect(x, y, fill, h, h / 2);
      }
    }

    // Fire events
    const myId = SocketClient.myPlayerId;
    (this._simData?.results ?? []).forEach(r => {
      const key      = `${r.homeId}|${r.awayId}`;
      const isMyMatch = r.homeId === myId || r.awayId === myId;
      (r.events ?? []).forEach((e, ei) => {
        if (e.type !== 'goal') return;
        const eKey = `${key}_${ei}`;
        if (!this._shownKeys.has(eKey) && e.minute <= minute) {
          this._shownKeys.add(eKey);

          // Update live score
          const ls = this._liveScores[key];
          if (e.managerId === r.homeId) ls.home++;
          else                          ls.away++;

          // Bounce score text
          const sc = this._scoreObjs[key];
          if (sc) {
            sc.setText(`${ls.home}  :  ${ls.away}`);
            this.tweens.add({ targets: sc, scaleX: 1.30, scaleY: 1.30, duration: 180, yoyo: true, ease: 'Power2' });
          }

          // Store in history (with score snapshot)
          const histItem = { e, r, key, minute, isMyMatch, scoreSnap: { ...ls } };
          this._eventHistory.push(histItem);
          this._appendFeedRow(histItem, false);

          // Cinematic for my match
          if (isMyMatch) this._goalBanner(e, myId);
        }
      });
    });

    // Halftime flash
    if (minute === 45 && !this._shownKeys.has('__ht__')) {
      this._shownKeys.add('__ht__');
      this._showFlashText('HALBZEIT', '#ffd600');
    }

    // End
    if (fraction >= 1) {
      this._simTimer?.remove();
      this._simTimer = null;
      this._showFinalWhistle();
    }
  }

  // ── Feed row ──────────────────────────────────────────────────────────────
  _appendFeedRow({ e, r, key, minute, isMyMatch, scoreSnap }, instant) {
    if (!this._feedBounds) return;
    const { x, y, w, h, itemH, gap } = this._feedBounds;
    const idx  = this._feedCount++;
    const rowY = y + idx * (itemH + gap);
    if (rowY + itemH > y + h - Math.round(4 * this._simScale)) return;

    const s        = this._simScale;
    const fs       = n => `${Math.round(n * s)}px`;
    const myId     = SocketClient.myPlayerId;
    const isMine   = e.managerId === myId;
    const teamName = e.managerId === r.homeId ? r.homeName : r.awayName;
    const scoreStr = `${scoreSnap.home}:${scoreSnap.away}`;

    // Row background
    const bg = this.add.graphics();
    bg.fillStyle(isMine ? 0x072010 : isMyMatch ? 0x130e00 : 0x060e14, 0.96);
    bg.fillRoundedRect(x + Math.round(4 * s), rowY, w - Math.round(8 * s), itemH, 5);
    if (isMine) { bg.lineStyle(1, 0x00c853, 0.55); bg.strokeRoundedRect(x + Math.round(4 * s), rowY, w - Math.round(8 * s), itemH, 5); }
    this.objects.push(bg);

    // Minute badge
    const mbg = this.add.graphics();
    mbg.fillStyle(isMine ? 0x00c853 : isMyMatch ? 0xffd600 : 0x1a3a1a, 1);
    mbg.fillRoundedRect(x + Math.round(8 * s), rowY + Math.round(4 * s), Math.round(30 * s), itemH - Math.round(8 * s), 4);
    this.objects.push(mbg);

    const minT = this.add.text(x + Math.round(23 * s), rowY + itemH / 2,
      `${e.minute}'`, { fontSize: fs(9), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
        color: isMine ? '#000' : isMyMatch ? '#000' : '#3a6a3a' }).setOrigin(0.5);
    this.objects.push(minT);

    const nameT = this.add.text(x + Math.round(46 * s), rowY + itemH / 2,
      `⚽  ${e.playerName}`, { fontSize: fs(11), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
        color: isMine ? '#00e676' : isMyMatch ? '#ffd600' : '#4a7a4a' }).setOrigin(0, 0.5);
    this.objects.push(nameT);

    const teamT = this.add.text(x + Math.round(46 * s), rowY + itemH / 2 + Math.round(12 * s),
      teamName, { fontSize: fs(8), fontFamily: 'Rajdhani, Arial',
        color: isMine ? '#2a7a3a' : isMyMatch ? '#7a6a00' : '#2a4a2a' }).setOrigin(0, 0.5);
    this.objects.push(teamT);

    const scT = this.add.text(x + w - Math.round(14 * s), rowY + itemH / 2,
      scoreStr, { fontSize: fs(15), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold',
        color: isMine ? '#00e676' : isMyMatch ? '#ffd600' : '#3a6a3a' }).setOrigin(1, 0.5);
    this.objects.push(scT);

    if (!instant) {
      [bg, mbg, minT, nameT, teamT, scT].forEach(o => {
        o.setAlpha(0);
        this.tweens.add({ targets: o, alpha: 1, duration: 350, ease: 'Power2' });
      });
    }
  }

  // ── Goal banner animation ─────────────────────────────────────────────────
  _goalBanner(e, myId) {
    const W = this.scale.width, H = this.scale.height;
    const s      = this._simScale;
    const isMine = e.managerId === myId;
    const hexCol = isMine ? '#00e676' : '#ff5252';
    const stroke = isMine ? '#003a10' : '#3a0000';

    // Screen edge vignette flash
    const flash = this.add.graphics();
    flash.fillStyle(isMine ? 0x00c853 : 0xe53935, 0.16);
    flash.fillRect(0, 0, W, H);
    flash.setAlpha(0);
    this.objects.push(flash);
    this.tweens.add({
      targets: flash, alpha: 1, duration: 80, yoyo: true, hold: 300,
      onComplete: () => { try { flash.destroy(); } catch (_) {} },
    });

    // Main label — big, text only, slides up from slightly below
    const t1 = this.add.text(W / 2, H * 0.44,
      isMine ? '⚽  TOOOR!' : '⚽  GEGENTOR!', {
        fontSize:        `${Math.round(58 * s)}px`,
        fontFamily:      'Oswald, Arial Black',
        fontStyle:       'bold',
        color:           hexCol,
        stroke:          stroke,
        strokeThickness: Math.round(8 * s),
      }).setOrigin(0.5).setAlpha(0).setScale(0.6);
    this.objects.push(t1);

    // Player name below
    const t2 = this.add.text(W / 2, H * 0.44 + Math.round(56 * s),
      e.playerName, {
        fontSize:        `${Math.round(24 * s)}px`,
        fontFamily:      'Oswald, Arial',
        fontStyle:       'bold',
        color:           '#ffffff',
        stroke:          '#000000',
        strokeThickness: Math.round(5 * s),
      }).setOrigin(0.5).setAlpha(0).setScale(0.6);
    this.objects.push(t2);

    // In: punch-scale from 0.6 → 1 → slight settle
    this.tweens.add({
      targets: [t1, t2], alpha: 1, scaleX: 1, scaleY: 1,
      duration: 280, ease: 'Back.Out',
    });
    // Out: fade
    this.tweens.add({
      targets: [t1, t2], alpha: 0,
      duration: 350, ease: 'Power2', delay: 2200,
      onComplete: () => { [t1, t2].forEach(o => { try { o.destroy(); } catch (_) {} }); },
    });
  }

  // ── Generic flash text ─────────────────────────────────────────────────────
  _showFlashText(txt, color = '#fff') {
    const W = this.scale.width, H = this.scale.height;
    const s = this._simScale;
    const t = this.add.text(W / 2, H * 0.46, txt, {
      fontSize: `${Math.round(72 * s)}px`, fontFamily: 'Oswald, Arial Black',
      fontStyle: 'bold', color,
      stroke: '#000', strokeThickness: Math.round(7 * s),
    }).setOrigin(0.5).setAlpha(0).setScale(0.55);
    this.objects.push(t);
    this.tweens.add({ targets: t, alpha: 1, scaleX: 1, scaleY: 1, duration: 380, ease: 'Back.Out' });
    this.tweens.add({
      targets: t, alpha: 0, duration: 500, ease: 'Power2', delay: 2000,
      onComplete: () => { try { t.destroy(); } catch (_) {} },
    });
  }

  // ── Abpfiff ───────────────────────────────────────────────────────────────
  _showFinalWhistle() {
    this._showFlashText('🏁  ABPFIFF!', '#fff');
    this.time.delayedCall(2200, () => {
      this._phase = 'results';
      this._rebuildLayout();
    });
  }

  // ── Core layout builder ───────────────────────────────────────────────────
  _rebuildLayout() {
    this._clearObjects();
    this._minuteText     = null;
    this._progressGfx    = null;
    this._progressBounds = null;
    this._scoreObjs      = {};
    this._feedBounds     = null;
    this._feedCount      = 0;
    this._countdownText  = null;

    const W = this.scale.width, H = this.scale.height;
    const s = Math.min(W / 1280, H / 720);
    this._simScale = s;

    if (this._phase === 'waiting')    { this._drawWaiting(W, H, s); return; }
    if (this._phase === 'cards')      { this._drawCardReveal(W, H, s); return; }
    if (this._phase === 'simulating') { this._drawSimUI(W, H, s); return; }
    if (this._phase === 'results')    { this._drawResults(W, H, s); }
  }

  redraw() { this._rebuildLayout(); }

  _onResize() {
    const wasSim = this._phase === 'simulating';
    if (wasSim && this._simTimer) { this._simTimer.remove(); this._simTimer = null; }

    this._rebuildLayout();

    // Replay feed items at new size
    if (wasSim) {
      this._eventHistory.forEach(item => this._appendFeedRow(item, true));
      this._simTimer = this.time.addEvent({
        delay: TICK_MS, loop: true, callback: this._tick, callbackScope: this,
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CARD REVEAL SCREEN
  // ══════════════════════════════════════════════════════════════════════════
  _drawCardReveal(W, H, s) {
    addStadiumBg(this, this.objects, W, H);
    const CX = W / 2;
    const fs = n => `${Math.round(n * s)}px`;
    const d  = this._simData;
    const results  = d?.results ?? [];
    const myId     = SocketClient.myPlayerId;
    const myResult = results.find(r => r.homeId === myId || r.awayId === myId);
    const isHome   = myResult?.homeId === myId;
    const myName   = myResult ? (isHome ? myResult.homeName : myResult.awayName) : '?';
    const oppName  = myResult ? (isHome ? myResult.awayName : myResult.homeName) : '?';
    const myForm   = myResult ? ((isHome ? myResult.homeFormation : myResult.awayFormation) ?? '4-3-3') : '';
    const oppForm  = myResult ? ((isHome ? myResult.awayFormation : myResult.homeFormation) ?? '4-3-3') : '';
    const myCards  = ((isHome ? myResult?.homeCardEffects : myResult?.awayCardEffects) ?? []);
    const oppCards = ((isHome ? myResult?.awayCardEffects : myResult?.homeCardEffects) ?? []);

    // ── Header ───────────────────────────────────────────────────────────────
    this.objects.push(this.add.text(CX, Math.round(36 * s),
      `⚽  SPIELTAG ${d?.matchday ?? '?'}`, {
        fontSize: fs(34), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#fff',
        stroke: '#000', strokeThickness: Math.round(4 * s),
      }).setOrigin(0.5));

    // ── VS banner ────────────────────────────────────────────────────────────
    const vsY = Math.round(100 * s);
    this.objects.push(this.add.text(CX - Math.round(200 * s), vsY,
      myName, { fontSize: fs(22), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#00e676' })
      .setOrigin(0.5));
    this.objects.push(this.add.text(CX - Math.round(200 * s), vsY + Math.round(26 * s),
      myForm, { fontSize: fs(11), fontFamily: 'Rajdhani, Arial', color: '#1e5a2a' })
      .setOrigin(0.5));
    this.objects.push(this.add.text(CX, vsY,
      'VS', { fontSize: fs(20), fontFamily: 'Oswald, Arial Black', color: '#1a3a1a' })
      .setOrigin(0.5));
    this.objects.push(this.add.text(CX + Math.round(200 * s), vsY,
      oppName, { fontSize: fs(22), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#ff7043' })
      .setOrigin(0.5));
    this.objects.push(this.add.text(CX + Math.round(200 * s), vsY + Math.round(26 * s),
      oppForm, { fontSize: fs(11), fontFamily: 'Rajdhani, Arial', color: '#5a2a1a' })
      .setOrigin(0.5));

    // ── Divider ──────────────────────────────────────────────────────────────
    const divG = this.add.graphics();
    divG.fillStyle(0x1e3a24, 1);
    divG.fillRect(Math.round(40 * s), Math.round(142 * s), W - Math.round(80 * s), 1);
    this.objects.push(divG);

    // ── Cards section ────────────────────────────────────────────────────────
    const cardsTop = Math.round(154 * s);
    const gap      = Math.round(10 * s);
    const colW     = Math.round((W - Math.round(60 * s)) / 2);
    const leftX    = Math.round(20 * s);
    const rightX   = leftX + colW + gap;

    if (myCards.length === 0 && oppCards.length === 0) {
      this.objects.push(this.add.text(CX, cardsTop + Math.round(40 * s),
        'Keine Aktionskarten eingesetzt', {
          fontSize: fs(15), fontFamily: 'Oswald, Arial', color: '#1a3a1a',
        }).setOrigin(0.5));
    } else {
      if (myCards.length > 0) {
        this.objects.push(this.add.text(leftX + colW / 2, cardsTop,
          '⚡  DEINE AKTIONSKARTEN', {
            fontSize: fs(11), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#00c853',
          }).setOrigin(0.5));
        myCards.forEach((e, i) => this._drawCardRevealItem(
          e, leftX, cardsTop + Math.round(22 * s) + i * Math.round(70 * s), colW, s, fs, false, i
        ));
      }
      if (oppCards.length > 0) {
        this.objects.push(this.add.text(rightX + colW / 2, cardsTop,
          '⚡  GEGNER AKTIONSKARTEN', {
            fontSize: fs(11), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ff5252',
          }).setOrigin(0.5));
        oppCards.forEach((e, i) => this._drawCardRevealItem(
          e, rightX, cardsTop + Math.round(22 * s) + i * Math.round(70 * s), colW, s, fs, true,
          i + myCards.length
        ));
      }
    }

    // ── Countdown text ───────────────────────────────────────────────────────
    const ct = this.add.text(CX, H - Math.round(70 * s), '', {
      fontSize: fs(20), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ffd600',
    }).setOrigin(0.5);
    this.objects.push(ct);
    this._countdownText = ct;
  }

  _drawCardRevealItem(effect, x, y, w, s, fs, isOpp, staggerIdx) {
    const info   = CARD_INFO[effect.effect] ?? { icon: '🃏', name: effect.effect, col: 0x444444, desc: () => '' };
    const accent = info.col;
    const cardH  = Math.round(62 * s);

    const g = this.add.graphics();
    // Subtle glow
    for (let i = 3; i >= 1; i--) {
      const sh = i * Math.round(2 * s);
      g.fillStyle(accent, 0.015 * i);
      g.fillRoundedRect(x - sh, y - sh, w + sh * 2, cardH + sh * 2, 12 + sh);
    }
    g.fillStyle(isOpp ? 0x1a0508 : 0x040e08, 0.96);
    g.fillRoundedRect(x, y, w, cardH, 10);
    g.fillStyle(accent, 0.25);
    g.fillRoundedRect(x, y, w, Math.round(cardH * 0.35), 10);
    g.lineStyle(1.5, accent, 0.9);
    g.strokeRoundedRect(x, y, w, cardH, 10);
    g.setAlpha(0);
    this.objects.push(g);

    // Icon
    const iconT = this.add.text(x + Math.round(26 * s), y + cardH / 2,
      info.icon, { fontSize: fs(24) }).setOrigin(0.5).setAlpha(0);
    this.objects.push(iconT);

    // Name
    const nameT = this.add.text(x + Math.round(54 * s), y + Math.round(16 * s),
      info.name, {
        fontSize: fs(14), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
        color: isOpp ? '#ff7777' : '#00e676',
      }).setAlpha(0);
    this.objects.push(nameT);

    // Description
    const target = effect.targetPlayerName ?? null;
    const descT  = this.add.text(x + Math.round(54 * s), y + Math.round(36 * s),
      info.desc(target), {
        fontSize: fs(11), fontFamily: 'Rajdhani, Arial',
        color: isOpp ? '#8a3030' : '#2a6a3a',
      }).setAlpha(0);
    this.objects.push(descT);

    const delay = 300 + staggerIdx * 450;
    [g, iconT, nameT, descT].forEach(o =>
      this.tweens.add({ targets: o, alpha: 1, duration: 350, ease: 'Power2', delay })
    );
  }

  // ── Waiting ────────────────────────────────────────────────────────────────
  _drawWaiting(W = this.scale.width, H = this.scale.height, s = Math.min(W / 1280, H / 720)) {
    addStadiumBg(this, this.objects, W, H);
    const spin = this.add.text(W / 2, H / 2, '⏳  Spieltag wird simuliert…', {
      fontSize: `${Math.round(22 * s)}px`, fontFamily: 'Oswald, Arial', color: '#5a8a5a',
    }).setOrigin(0.5);
    this.objects.push(spin);
    this.tweens.add({ targets: spin, alpha: 0.3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine' });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SIMULATION SCREEN
  // ══════════════════════════════════════════════════════════════════════════
  _drawSimUI(W, H, s) {
    addStadiumBg(this, this.objects, W, H);
    const fs = n => `${Math.round(n * s)}px`;
    const d  = this._simData;
    const results  = d?.results ?? [];
    const myId     = SocketClient.myPlayerId;
    const myResult = results.find(r => r.homeId === myId || r.awayId === myId);
    const others   = results.filter(r => r !== myResult);

    // ── TOP BAR ─────────────────────────────────────────────────────────────
    const barH = Math.round(50 * s);
    const topG = this.add.graphics();
    topG.fillStyle(0x060e14, 0.97); topG.fillRect(0, 0, W, barH);
    topG.fillStyle(0x1e5a2a, 1);   topG.fillRect(0, barH - 1, W, 1);
    this.objects.push(topG);

    this.objects.push(this.add.text(Math.round(18 * s), barH / 2,
      `⚽  SPIELTAG ${d?.matchday ?? '?'}`, {
        fontSize: fs(20), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#fff',
      }).setOrigin(0, 0.5));

    // Progress bar
    const pbX = Math.round(230 * s);
    const pbW = W - Math.round(310 * s);
    const pbH = Math.round(10 * s);
    const pbY = (barH - pbH) / 2;
    const pbG = this.add.graphics();
    pbG.fillStyle(0x0a200e, 1);
    pbG.fillRoundedRect(pbX, pbY, pbW, pbH, pbH / 2);
    this.objects.push(pbG);
    this._progressGfx    = pbG;
    this._progressBounds = { x: pbX, y: pbY, w: pbW, h: pbH };

    // Minute text
    const mt = this.add.text(W - Math.round(16 * s), barH / 2, "0'", {
      fontSize: fs(17), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#00e676',
    }).setOrigin(1, 0.5);
    this.objects.push(mt);
    this._minuteText = mt;

    // ── LAYOUT ──────────────────────────────────────────────────────────────
    const gap    = Math.round(10 * s);
    const contY  = barH + gap;
    const rightW = Math.round(Math.min(270 * s, W * 0.24));
    const leftW  = W - rightW - gap * 3;

    // My match panel (left-top, tall)
    const myH = Math.round(Math.min(200 * s, (H - contY - gap * 2) * 0.44));
    if (myResult) {
      this._drawMyMatchLive(myResult, myId, gap, contY, leftW, myH, s, fs);
    }

    // Feed (left-bottom)
    const feedY = contY + myH + gap;
    const feedH = H - feedY - gap;
    this._drawFeedPanel(gap, feedY, leftW, feedH, s, fs);

    // Other matches (right column)
    const rightX = W - rightW - gap;
    this._drawOthersPanel(rightX, contY, rightW, H - contY - gap, s, fs, others, myId);
  }

  _drawMyMatchLive(r, myId, x, y, w, h, s, fs) {
    const isHome = r.homeId === myId;
    const key    = `${r.homeId}|${r.awayId}`;
    const ls     = this._liveScores[key] ?? { home: 0, away: 0 };

    // Panel glow
    const g = this.add.graphics();
    for (let i = 6; i >= 1; i--) {
      const sh = i * Math.round(2 * s);
      g.fillStyle(0x00c853, 0.018 * i);
      g.fillRoundedRect(x - sh, y - sh, w + sh * 2, h + sh * 2, 16 + sh);
    }
    g.fillStyle(0x060e14, 0.97);   g.fillRoundedRect(x, y, w, h, 14);
    g.fillStyle(0x00c853, 0.30);   g.fillRoundedRect(x, y, w, Math.round(h * 0.30), 14);
    g.lineStyle(2.5, 0x00c853, 1); g.strokeRoundedRect(x, y, w, h, 14);
    this.objects.push(g);

    // Live pill
    const pill = this.add.graphics();
    pill.fillStyle(0x880000, 1);
    pill.fillRoundedRect(x + Math.round(14 * s), y + Math.round(10 * s), Math.round(54 * s), Math.round(18 * s), 9);
    this.objects.push(pill);
    this.tweens.add({ targets: pill, alpha: 0.3, duration: 500, yoyo: true, repeat: -1, ease: 'Sine' });

    const pillDot = this.add.graphics();
    pillDot.fillStyle(0xff2222, 1);
    pillDot.fillCircle(x + Math.round(22 * s), y + Math.round(19 * s), Math.round(3 * s));
    this.objects.push(pillDot);
    this.objects.push(this.add.text(x + Math.round(41 * s), y + Math.round(19 * s), 'LIVE', {
      fontSize: fs(9), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#fff',
    }).setOrigin(0.5));

    // "MEIN SPIEL"
    this.objects.push(this.add.text(x + w / 2, y + Math.round(19 * s), 'MEIN SPIEL', {
      fontSize: fs(10), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#1e5a2a',
    }).setOrigin(0.5));

    // Team names
    const myName  = isHome ? r.homeName : r.awayName;
    const oppName = isHome ? r.awayName : r.homeName;
    this.objects.push(this.add.text(x + Math.round(w * 0.21), y + Math.round(h * 0.54),
      myName, { fontSize: fs(15), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#00e676' })
      .setOrigin(0.5));
    this.objects.push(this.add.text(x + Math.round(w * 0.79), y + Math.round(h * 0.54),
      oppName, { fontSize: fs(15), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#ff7043' })
      .setOrigin(0.5));

    // VS label
    this.objects.push(this.add.text(x + w / 2, y + Math.round(h * 0.38), 'VS', {
      fontSize: fs(9), fontFamily: 'Oswald, Arial', color: '#1e3a24',
    }).setOrigin(0.5));

    // Big score (slightly higher to make room for cards at bottom)
    const scoreT = this.add.text(x + w / 2, y + Math.round(h * 0.54),
      `${ls.home}  :  ${ls.away}`, {
        fontSize: `${Math.round(48 * s)}px`, fontFamily: 'Oswald, Arial Black',
        fontStyle: 'bold', color: '#fff',
        stroke: '#000000', strokeThickness: Math.round(3 * s),
      }).setOrigin(0.5);
    this.objects.push(scoreT);
    this._scoreObjs[key] = scoreT;

    // Heimspiel/Auswärts label under score
    this.objects.push(this.add.text(x + w / 2, y + Math.round(h * 0.70),
      isHome ? 'Heimspiel' : 'Auswärtsspiel', {
        fontSize: fs(8), fontFamily: 'Rajdhani, Arial', color: '#1e4a2a',
      }).setOrigin(0.5));

    // Formation badge (top right)
    this.objects.push(this.add.text(x + w - Math.round(14 * s), y + Math.round(19 * s),
      `${r.homeFormation ?? '4-3-3'}  vs  ${r.awayFormation ?? '4-3-3'}`, {
        fontSize: fs(9), fontFamily: 'Rajdhani, Arial', color: '#1e4a2a',
      }).setOrigin(1, 0.5));

    // ── Card chips: left half = my team, right half = opponent ──────────────
    const myCards  = ((isHome ? r.homeCardEffects : r.awayCardEffects) ?? []);
    const oppCards = ((isHome ? r.awayCardEffects : r.homeCardEffects) ?? []);
    if (myCards.length > 0 || oppCards.length > 0) {
      const chipH  = Math.round(16 * s);
      const chipY  = y + h - Math.round(10 * s) - chipH;
      const chipPad = Math.round(5 * s);
      const chipGap = Math.round(4 * s);
      const margin  = Math.round(10 * s);
      const midX    = x + w / 2;

      // Horizontal divider above chips
      const dg = this.add.graphics();
      dg.fillStyle(0x1e3a24, 1);
      dg.fillRect(x + margin, chipY - Math.round(5 * s), w - margin * 2, 1);
      this.objects.push(dg);

      // Vertical center divider
      const vdg = this.add.graphics();
      vdg.fillStyle(0x1e3a24, 0.7);
      vdg.fillRect(midX - 0.5, chipY - Math.round(4 * s), 1, chipH + Math.round(4 * s));
      this.objects.push(vdg);

      const drawChip = (e, startX, isOpp, colEnd) => {
        const info  = CARD_INFO[e.effect] ?? { icon: '🃏', name: e.effect, col: 0x444444 };
        const label = `${info.icon} ${info.name}`;
        const chipW = Math.round(chipPad * 2 + label.length * Math.round(6 * s));
        if (startX + chipW > colEnd) return startX; // overflow guard

        const cg = this.add.graphics();
        cg.fillStyle(isOpp ? 0x2a0508 : 0x041208, 1);
        cg.fillRoundedRect(startX, chipY, chipW, chipH, chipH / 2);
        cg.lineStyle(1, isOpp ? 0xe53935 : info.col, 0.8);
        cg.strokeRoundedRect(startX, chipY, chipW, chipH, chipH / 2);
        this.objects.push(cg);

        this.objects.push(this.add.text(startX + chipW / 2, chipY + chipH / 2, label, {
          fontSize: fs(8), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
          color: isOpp ? '#ff7777' : `#${info.col.toString(16).padStart(6, '0')}`,
        }).setOrigin(0.5));

        // Hover zone — tooltip on pointer over
        const zone = this.add.zone(startX, chipY, chipW, chipH)
          .setOrigin(0, 0).setInteractive({ useHandCursor: true }).setDepth(50);
        zone.on('pointerover', () => this._showCardTooltip(startX + chipW / 2, chipY, info, e, s));
        zone.on('pointerout',  () => this._hideCardTooltip());
        this.objects.push(zone);

        return startX + chipW + chipGap;
      };

      // My cards — left half (aligned with my team name on the left)
      let cx = x + margin;
      myCards.forEach(e => { cx = drawChip(e, cx, false, midX - chipGap); });

      // Opp cards — right half (aligned with opp team name on the right)
      cx = midX + chipGap;
      oppCards.forEach(e => { cx = drawChip(e, cx, true, x + w - margin); });
    }
  }

  _drawFeedPanel(x, y, w, h, s, fs) {
    const g = this.add.graphics();
    for (let i = 3; i >= 1; i--) {
      const sh = i * Math.round(2 * s);
      g.fillStyle(0x00c853, 0.009 * i);
      g.fillRoundedRect(x - sh, y - sh, w + sh * 2, h + sh * 2, 12 + sh);
    }
    g.fillStyle(0x060e14, 0.90);  g.fillRoundedRect(x, y, w, h, 12);
    g.lineStyle(1, 0x182a18, 1); g.strokeRoundedRect(x, y, w, h, 12);
    this.objects.push(g);

    this.objects.push(this.add.text(x + Math.round(14 * s), y + Math.round(13 * s),
      '📡  LIVE TICKER', {
        fontSize: fs(10), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#1a4a2a',
      }));

    const itemH = Math.round(30 * s);
    const gap   = Math.round(3 * s);
    this._feedBounds = {
      x, y: y + Math.round(33 * s),
      w, h: h - Math.round(36 * s),
      itemH, gap,
    };
  }

  _drawOthersPanel(x, y, w, h, s, fs, others, myId) {
    const g = this.add.graphics();
    for (let i = 3; i >= 1; i--) {
      const sh = i * Math.round(2 * s);
      g.fillStyle(0x2979ff, 0.008 * i);
      g.fillRoundedRect(x - sh, y - sh, w + sh * 2, h + sh * 2, 12 + sh);
    }
    g.fillStyle(0x060e14, 0.92);  g.fillRoundedRect(x, y, w, h, 12);
    g.lineStyle(1, 0x0a2040, 1); g.strokeRoundedRect(x, y, w, h, 12);
    this.objects.push(g);

    this.objects.push(this.add.text(x + w / 2, y + Math.round(14 * s),
      'ANDERE SPIELE', {
        fontSize: fs(10), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#14406a',
      }).setOrigin(0.5));

    const rowH   = Math.round(72 * s);
    const rowGap = Math.round(6 * s);
    const startY = y + Math.round(32 * s);

    others.forEach((r, i) => {
      const ry  = startY + i * (rowH + rowGap);
      if (ry + rowH > y + h - rowGap) return;
      const key = `${r.homeId}|${r.awayId}`;
      const ls  = this._liveScores[key] ?? { home: 0, away: 0 };

      const rg = this.add.graphics();
      rg.fillStyle(0x06101a, 0.92);
      rg.fillRoundedRect(x + Math.round(5 * s), ry, w - Math.round(10 * s), rowH, 8);
      rg.lineStyle(1, 0x0a1a30, 1);
      rg.strokeRoundedRect(x + Math.round(5 * s), ry, w - Math.round(10 * s), rowH, 8);
      this.objects.push(rg);

      // Red live dot
      const ldot = this.add.graphics();
      ldot.fillStyle(0xff2222, 1);
      ldot.fillCircle(x + Math.round(14 * s), ry + Math.round(13 * s), Math.round(3 * s));
      this.objects.push(ldot);
      this.tweens.add({ targets: ldot, alpha: 0.1, duration: 550 + i * 100, yoyo: true, repeat: -1, ease: 'Sine' });

      // Names (left side)
      this.objects.push(this.add.text(x + Math.round(22 * s), ry + Math.round(14 * s),
        r.homeName, { fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#bbb' }));
      this.objects.push(this.add.text(x + Math.round(22 * s), ry + Math.round(42 * s),
        r.awayName, { fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#bbb' }));

      // Score (right)
      const scT = this.add.text(x + w - Math.round(16 * s), ry + rowH / 2,
        `${ls.home} : ${ls.away}`, {
          fontSize: fs(22), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#ffd600',
        }).setOrigin(1, 0.5);
      this.objects.push(scT);
      this._scoreObjs[key] = scT;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RESULTS SCREEN
  // ══════════════════════════════════════════════════════════════════════════
  _drawResults(W, H, s) {
    addStadiumBg(this, this.objects, W, H);
    const CX = W / 2;
    const fs = n => `${Math.round(n * s)}px`;
    const d  = this._simData ?? this._initData;
    if (!d) return;

    const { results, standings, nextPhase, matchday } = d;
    const myId     = SocketClient.myPlayerId;
    const myResult = (results ?? []).find(r => r.homeId === myId || r.awayId === myId);

    // Top bar
    const barH = Math.round(52 * s);
    const topG = this.add.graphics();
    topG.fillStyle(0x060e14, 0.94); topG.fillRect(0, 0, W, barH);
    topG.fillStyle(0xffd600, 1);    topG.fillRect(0, barH - 2, W, 2);
    this.objects.push(topG);
    this.objects.push(this.add.text(CX, barH / 2,
      `⚽  SPIELTAG ${matchday}  —  ERGEBNISSE`, {
        fontSize: fs(20), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#fff',
      }).setOrigin(0.5));

    const gap      = Math.round(10 * s);
    const rightW   = Math.round(300 * s);
    const leftW    = W - rightW - gap * 3;
    const contentY = barH + gap;
    const contentH = H - barH - Math.round(64 * s) - gap * 2;
    let   curY     = contentY;

    if (myResult) {
      const mh = Math.round(Math.min(220 * s, contentH * 0.52));
      this._drawMyResultPanel(myResult, myId, gap, curY, leftW, mh, s, fs);
      curY += mh + gap;
    }

    const others  = myResult ? (results ?? []).filter(r => r !== myResult) : (results ?? []);
    const cols    = Math.min(2, others.length);
    const cardW   = cols > 1 ? Math.round((leftW - gap) / 2) : leftW;
    const cardH   = Math.round(90 * s);
    others.forEach((r, i) => {
      const col = cols > 1 ? i % cols : 0;
      const row = cols > 1 ? Math.floor(i / cols) : i;
      const cx  = gap + col * (cardW + gap);
      const cy  = curY + row * (cardH + gap);
      if (cy + cardH <= H - Math.round(70 * s)) {
        this._drawCompact(r, cx, cy, cardW, cardH, s, fs, myId);
      }
    });

    if (standings?.length) {
      this._drawStandings(W - rightW - gap, contentY, rightW, contentH, s, fs, standings, myId);
    }

    this._drawNav(W, H, s, fs, nextPhase);
  }

  _drawMyResultPanel(r, myId, x, y, w, h, s, fs) {
    const isHome = r.homeId === myId;
    const myG    = isHome ? r.homeGoals : r.awayGoals;
    const oppG   = isHome ? r.awayGoals : r.homeGoals;
    const won = myG > oppG, drew = myG === oppG;
    const bCol   = won ? 0x00c853 : drew ? 0xffd600 : 0xe53935;
    const ptsLbl = won ? '+3 Punkte' : drew ? '+1 Punkt' : '+0 Punkte';
    const ptsCol = won ? '#00e676' : drew ? '#ffd600' : '#ff5252';

    // ── Panel background ──────────────────────────────────────────────────────
    const g = this.add.graphics();
    for (let i = 6; i >= 1; i--) {
      const sh = i * Math.round(2 * s);
      g.fillStyle(bCol, 0.020 * i);
      g.fillRoundedRect(x - sh, y - sh, w + sh * 2, h + sh * 2, 14 + sh);
    }
    g.fillStyle(0x060e14, 0.95);   g.fillRoundedRect(x, y, w, h, 14);
    g.fillStyle(bCol, 0.35);       g.fillRoundedRect(x, y, w, Math.round(h * 0.22), 14);
    g.lineStyle(2.5, bCol, 1);    g.strokeRoundedRect(x, y, w, h, 14);
    this.objects.push(g);

    // Header label
    this.objects.push(this.add.text(x + w / 2, y + Math.round(14 * s), 'DEIN SPIEL', {
      fontSize: fs(10), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#3a6a3a',
    }).setOrigin(0.5));

    // ── Score area (top ~46% of panel) ───────────────────────────────────────
    const scoreY = y + Math.round(h * 0.30);
    this.objects.push(this.add.text(x + Math.round(w * 0.22), scoreY,
      isHome ? r.homeName : r.awayName, {
        fontSize: fs(15), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#00e676',
      }).setOrigin(0.5));
    this.objects.push(this.add.text(x + w / 2, scoreY,
      `${r.homeGoals}  :  ${r.awayGoals}`, {
        fontSize: fs(36), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#fff',
      }).setOrigin(0.5));
    this.objects.push(this.add.text(x + Math.round(w * 0.78), scoreY,
      isHome ? r.awayName : r.homeName, {
        fontSize: fs(15), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#ff7043',
      }).setOrigin(0.5));

    // Points label
    this.objects.push(this.add.text(x + w / 2, y + Math.round(h * 0.46), ptsLbl, {
      fontSize: fs(15), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: ptsCol,
    }).setOrigin(0.5));

    // Divider
    const divY = y + Math.round(h * 0.54);
    const divG = this.add.graphics();
    divG.fillStyle(bCol, 0.20);
    divG.fillRect(x + Math.round(16 * s), divY, w - Math.round(32 * s), 1);
    this.objects.push(divG);

    // ── Bottom section: home goals LEFT | away goals RIGHT | MOTM centered ───
    const botY   = divY + Math.round(8 * s);
    const botH   = y + h - botY - Math.round(8 * s);
    const colPad = Math.round(14 * s);
    const colGap = Math.round(8 * s);
    const halfW  = Math.round((w - colPad * 2 - colGap) / 2);

    const allGoals  = (r.events ?? []).filter(e => e.type === 'goal').sort((a, b) => a.minute - b.minute);
    const homeGoals = allGoals.filter(e => e.managerId === r.homeId);
    const awayGoals = allGoals.filter(e => e.managerId === r.awayId);

    const motm  = isHome ? r.homeMOTM : r.awayMOTM;
    const cs    = isHome ? r.homeCS   : r.awayCS;
    const motmH = motm ? Math.round(38 * s) : 0;
    const listH = botH - motmH;

    const evH   = Math.round(22 * s);
    const evGap = Math.round(2 * s);

    const drawGoalCol = (goals, colX, colIsMyTeam) => {
      goals.forEach((ev, i) => {
        const ey = botY + i * (evH + evGap);
        if (ey + evH > botY + listH) return;

        const minBg = this.add.graphics();
        minBg.fillStyle(colIsMyTeam ? 0x052010 : 0x1a0505, 1);
        minBg.fillRoundedRect(colX, ey + Math.round(2 * s),
          Math.round(26 * s), evH - Math.round(4 * s), 4);
        minBg.setAlpha(0);
        this.objects.push(minBg);

        const minT = this.add.text(colX + Math.round(13 * s), ey + evH / 2,
          `${ev.minute}'`, { fontSize: fs(9), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
            color: colIsMyTeam ? '#00c853' : '#ff5252' })
          .setOrigin(0.5).setAlpha(0);
        this.objects.push(minT);

        const label = this.add.text(colX + Math.round(30 * s), ey + evH / 2,
          `⚽ ${ev.playerName ?? '?'}`, {
            fontSize: fs(10), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
            color: colIsMyTeam ? '#00e676' : '#ff7777',
          }).setOrigin(0, 0.5).setAlpha(0);
        this.objects.push(label);

        const delay = 300 + i * 200;
        [minBg, minT, label].forEach(o =>
          this.tweens.add({ targets: o, alpha: 1, duration: 320, ease: 'Power2', delay })
        );
      });
    };

    drawGoalCol(homeGoals, x + colPad,                    r.homeId === myId);
    drawGoalCol(awayGoals, x + colPad + halfW + colGap,   r.awayId === myId);

    // MOTM — centered at the bottom of the goal columns
    if (motm) {
      const motmY = botY + listH + Math.round(4 * s);

      const divMG = this.add.graphics();
      divMG.fillStyle(0xffd600, 0.15);
      divMG.fillRect(x + colPad, motmY - Math.round(2 * s), w - colPad * 2, 1);
      divMG.setAlpha(0);
      this.objects.push(divMG);

      const lbl = this.add.text(x + w / 2, motmY + Math.round(2 * s),
        '🌟 MOTM', { fontSize: fs(9), fontFamily: 'Oswald, Arial', color: '#5a5a00' })
        .setOrigin(0.5, 0).setAlpha(0);
      const nm = this.add.text(x + w / 2, motmY + Math.round(16 * s),
        motm.name, { fontSize: fs(13), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ffd600' })
        .setOrigin(0.5, 0).setAlpha(0);
      this.objects.push(lbl, nm);
      this.tweens.add({ targets: [divMG, lbl, nm], alpha: 1, duration: 400, delay: 800, ease: 'Power2' });
    }

    // CS badge top-left corner (decorative)
    if (cs) {
      const tl = this.add.graphics();
      tl.fillStyle(0x00c853, 1);
      tl.fillRoundedRect(x + Math.round(10 * s), y + Math.round(10 * s),
        Math.round(96 * s), Math.round(20 * s), 5);
      this.objects.push(tl);
      this.objects.push(this.add.text(x + Math.round(58 * s), y + Math.round(20 * s),
        '🔒 Clean Sheet', { fontSize: fs(8), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#000' })
        .setOrigin(0.5));
    }
  }

  _drawCompact(r, x, y, w, h, s, fs, myId) {
    const g = this.add.graphics();
    g.fillStyle(0x060e14, 0.92);
    g.fillRoundedRect(x, y, w, h, 10);
    g.lineStyle(1, 0x1e3a24, 1);
    g.strokeRoundedRect(x, y, w, h, 10);
    this.objects.push(g);

    this.objects.push(this.add.text(x + Math.round(10 * s), y + Math.round(12 * s),
      r.homeName, { fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ddd' }));
    this.objects.push(this.add.text(x + w - Math.round(10 * s), y + Math.round(12 * s),
      r.awayName, { fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ddd' }).setOrigin(1, 0));

    this.objects.push(this.add.text(x + w / 2, y + Math.round(h * 0.44),
      `${r.homeGoals}  :  ${r.awayGoals}`, {
        fontSize: fs(20), fontFamily: 'Oswald, Arial Black', fontStyle: 'bold', color: '#ffd600',
      }).setOrigin(0.5));

    const homeG = (r.events ?? []).filter(e => e.type === 'goal' && e.managerId === r.homeId).map(e => e.playerName).join(', ');
    const awayG = (r.events ?? []).filter(e => e.type === 'goal' && e.managerId === r.awayId).map(e => e.playerName).join(', ');
    if (homeG) this.objects.push(this.add.text(x + Math.round(10 * s), y + Math.round(h * 0.70),
      `⚽ ${homeG}`, { fontSize: fs(9), fontFamily: 'Rajdhani, Arial', color: '#5a8a5a',
        wordWrap: { width: w / 2 - Math.round(14 * s) } }));
    if (awayG) this.objects.push(this.add.text(x + w - Math.round(10 * s), y + Math.round(h * 0.70),
      `⚽ ${awayG}`, { fontSize: fs(9), fontFamily: 'Rajdhani, Arial', color: '#5a8a5a',
        align: 'right', wordWrap: { width: w / 2 - Math.round(14 * s) } }).setOrigin(1, 0));
  }

  _drawStandings(x, y, w, h, s, fs, standings, myId) {
    const g = this.add.graphics();
    for (let i = 5; i >= 1; i--) {
      const sh = i * Math.round(2 * s);
      g.fillStyle(0x00c853, 0.016 * i);
      g.fillRoundedRect(x - sh, y - sh, w + sh * 2, h + sh * 2, 16 + sh);
    }
    g.fillStyle(0x060e14, 0.92);  g.fillRoundedRect(x, y, w, h, 14);
    g.fillStyle(0x00c853, 0.20);  g.fillRoundedRect(x, y, w, Math.round(h * 0.06), 14);
    g.lineStyle(1, 0x1e5a2a, 1); g.strokeRoundedRect(x, y, w, h, 14);
    this.objects.push(g);

    this.objects.push(this.add.text(x + w / 2, y + Math.round(14 * s),
      'AKTUELLER STAND', {
        fontSize: fs(10), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#2a7a3a',
      }).setOrigin(0.5));

    const rowH   = Math.round(46 * s);
    const startY = y + Math.round(32 * s);
    const medals = ['🥇', '🥈', '🥉'];

    standings.forEach((p, i) => {
      const ry   = startY + i * rowH;
      if (ry + rowH > y + h - Math.round(8 * s)) return;
      const isMe = p.id === myId;
      const gd   = p.goalsFor - p.goalsAgainst;

      const rg = this.add.graphics();
      rg.fillStyle(isMe ? 0x0a2a10 : 0x0a1208, 1);
      rg.fillRoundedRect(x + Math.round(6 * s), ry, w - Math.round(12 * s), rowH - Math.round(3 * s), 6);
      if (isMe) { rg.lineStyle(1, 0x00c853, 1); rg.strokeRoundedRect(x + Math.round(6 * s), ry, w - Math.round(12 * s), rowH - Math.round(3 * s), 6); }
      this.objects.push(rg);

      const cHex = parseInt((p.colorHex ?? '#ffffff').replace('#', ''), 16);
      const cg = this.add.graphics();
      cg.fillStyle(cHex, 1);
      cg.fillRect(x + Math.round(12 * s), ry + Math.round(4 * s), Math.round(3 * s), rowH - Math.round(11 * s));
      this.objects.push(cg);

      this.objects.push(this.add.text(x + Math.round(20 * s), ry + Math.round(9 * s),
        medals[i] ?? `${i + 1}.`, { fontSize: fs(i < 3 ? 14 : 11), fontFamily: 'Oswald, Arial' }));
      this.objects.push(this.add.text(x + Math.round(44 * s), ry + Math.round(9 * s),
        p.name, { fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: isMe ? '#00e676' : '#ddd' }));
      this.objects.push(this.add.text(x + Math.round(44 * s), ry + Math.round(26 * s),
        `${p.wins}S ${p.draws}U ${p.losses}N`, { fontSize: fs(9), fontFamily: 'Rajdhani, Arial', color: '#3a6a3a' }));
      this.objects.push(this.add.text(x + w - Math.round(10 * s), ry + Math.round(9 * s),
        `${p.points} Pkt`, { fontSize: fs(13), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ffd600' }).setOrigin(1, 0));
      this.objects.push(this.add.text(x + w - Math.round(10 * s), ry + Math.round(26 * s),
        `${gd >= 0 ? '+' : ''}${gd}`, { fontSize: fs(9), fontFamily: 'Rajdhani, Arial',
          color: gd >= 0 ? '#00c853' : '#ff5252' }).setOrigin(1, 0));
    });
  }

  _drawNav(W, H, s, fs, nextPhase) {
    const barH = Math.round(56 * s);
    const barY = H - barH;
    const bg   = this.add.graphics();
    bg.fillStyle(0x061008, 0.97); bg.fillRect(0, barY, W, barH);
    bg.fillStyle(0x1e3a24, 1);   bg.fillRect(0, barY, W, 1);
    this.objects.push(bg);

    const labels = { winner: '🏆  SIEGER ANZEIGEN', transfer: '🔄  TRANSFERFENSTER', prep: '📊  ZUR TABELLE' };
    const label  = labels[nextPhase] ?? '📊  ZUR TABELLE';
    const bCol   = nextPhase === 'winner' ? 0xffd600 : nextPhase === 'transfer' ? 0x2979ff : 0x00c853;
    const tCol   = nextPhase === 'winner' ? '#000' : '#fff';

    const bW = Math.round(280 * s), bH = Math.round(40 * s);
    const bX = (W - bW) / 2, bY = barY + (barH - bH) / 2;
    const bG = this.add.graphics();
    bG.fillStyle(bCol, 1); bG.fillRoundedRect(bX, bY, bW, bH, 8);
    this.objects.push(bG);
    this.objects.push(this.add.text(bX + bW / 2, bY + bH / 2, label, {
      fontSize: fs(14), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: tCol,
    }).setOrigin(0.5));

    const z = this.add.zone(bX, bY, bW, bH).setOrigin(0).setInteractive({ cursor: 'pointer' });
    z.on('pointerover', () => { bG.clear(); bG.fillStyle(bCol, 0.75); bG.fillRoundedRect(bX, bY, bW, bH, 8); });
    z.on('pointerout',  () => { bG.clear(); bG.fillStyle(bCol, 1);    bG.fillRoundedRect(bX, bY, bW, bH, 8); });
    z.on('pointerdown', () => {
      if (nextPhase === 'winner')        this.scene.start('WinnerScene');
      else if (nextPhase === 'transfer') this.scene.start('TransferScene');
      else                               this.scene.start('TableScene');
    });
    this.objects.push(z);
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  /** Show a floating tooltip above a card chip. */
  _showCardTooltip(chipCX, chipTopY, info, effect, s) {
    this._hideCardTooltip();

    const fs   = n => `${Math.round(n * s)}px`;
    const desc = info.desc ? info.desc(effect.targetPlayerName ?? null) : '';
    const W    = this.scale.width;

    const ttW   = Math.round(175 * s);
    const padV  = Math.round(10 * s);
    const ttH   = padV * 2 + Math.round(20 * s) + (desc ? Math.round(20 * s) : 0);

    let ttX = Math.round(chipCX - ttW / 2);
    let ttY = chipTopY - ttH - Math.round(8 * s);
    ttX = Math.max(4, Math.min(ttX, W - ttW - 4));
    if (ttY < 4) ttY = chipTopY + Math.round(22 * s);

    const bg = this.add.graphics().setDepth(200);
    bg.fillStyle(0x060e14, 0.97);
    bg.fillRoundedRect(ttX, ttY, ttW, ttH, 8);
    bg.lineStyle(1.5, info.col, 0.9);
    bg.strokeRoundedRect(ttX, ttY, ttW, ttH, 8);

    const accentHex = `#${info.col.toString(16).padStart(6, '0')}`;
    const nameT = this.add.text(ttX + ttW / 2, ttY + padV,
      `${info.icon}  ${info.name}`, {
        fontSize: fs(11), fontFamily: 'Oswald, Arial', fontStyle: 'bold',
        color: accentHex,
      }).setOrigin(0.5, 0).setDepth(200);

    const ttObjs = [bg, nameT];

    if (desc) {
      const descT = this.add.text(ttX + ttW / 2, ttY + padV + Math.round(20 * s),
        desc, {
          fontSize: fs(9), fontFamily: 'Rajdhani, Arial',
          color: '#cccccc',
          wordWrap: { width: ttW - Math.round(14 * s) },
          align: 'center',
        }).setOrigin(0.5, 0).setDepth(200);
      ttObjs.push(descT);
    }

    this._tooltipObjs = ttObjs;
  }

  _hideCardTooltip() {
    if (this._tooltipObjs?.length) {
      this._tooltipObjs.forEach(o => { try { o?.destroy(); } catch (_) {} });
    }
    this._tooltipObjs = null;
  }

  _clearObjects() {
    this._hideCardTooltip();
    this.objects.forEach(o => { try { o?.destroy(); } catch (_) {} });
    this.objects = [];
  }

  _onShutdown() {
    if (this._simTimer)  { this._simTimer.remove();  this._simTimer  = null; }
    if (this._cardTimer) { this._cardTimer.remove();  this._cardTimer = null; }
    this.scale.off('resize', this._onResize, this);
    this.unsubs.forEach(u => u?.());
    this._clearObjects();
  }

  shutdown() { this._onShutdown(); }
}
