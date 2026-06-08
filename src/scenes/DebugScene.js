/**
 * DebugScene — läuft immer parallel zur aktiven Szene.
 * Aktivierung: F2 oder den kleinen "🐛"-Button in der oberen rechten Ecke.
 * Erlaubt direkten Sprung zu jeder Szene mit vorgefertigtem Mock-State.
 */
import { SocketClient } from '../network/SocketClient.js';

// ── Mock-Daten ─────────────────────────────────────────────────────────────────
function makeMockPlayers() {
  const CLUBS = [
    { id: 0, name: 'Ironvale FC',       colorHex: '#e74c3c' },
    { id: 1, name: 'Velora United',     colorHex: '#3498db' },
    { id: 2, name: 'Gridfield City',    colorHex: '#f39c12' },
    { id: 3, name: 'Sunspire Rovers',   colorHex: '#27ae60' },
    { id: 4, name: 'Northolm Athletic', colorHex: '#9b59b6' },
    { id: 5, name: 'Starlake Rangers',  colorHex: '#1abc9c' },
    { id: 6, name: 'Dawnport City',     colorHex: '#e67e22' },
    { id: 7, name: 'Blackmoor United',  colorHex: '#95a5a6' },
  ];
  const NAMES = ['Manager Alpha', 'Guardiola-KI', 'Klopp 2.0', 'Tuchel-Bot',
                 'Sir Alex Bot',  'Mourinho.exe', 'Ancelotti-AI', 'Nagelsmann v2'];
  return CLUBS.map((c, i) => ({
    id: i, name: NAMES[i], clubId: c.id, clubName: c.name, colorHex: c.colorHex,
    budget: 60 - i * 6, rosterSize: 14 - i, lineupSize: 11, cardCount: 3,
    points: 16 - i * 2, wins: 5 - Math.floor(i / 2), draws: 1, losses: i,
    goalsFor: 22 - i * 2, goalsAgainst: 10 + i * 2,
    seasonGoals: 22 - i * 2, formation: '4-3-3',
    isHost: i === 0, isBot: i !== 0, connected: true,
  }));
}

function makeMockRoster(managerId) {
  const pos = ['GK','DEF','DEF','DEF','DEF','MID','MID','MID','FWD','FWD','FWD'];
  const names = [
    'Viktor Dahl','Bruno Kestrel','Axel Prym','Dario Vann','Kosta Mair',
    'Felix Storm','Adan Cruz','Yannick Noel','Zayden Volt','Kai Storm','Rio Marz',
  ];
  return pos.map((p, i) => ({
    id: i + 1, name: names[i], pos: p,
    atk: 55 + i * 3, def: 80 - i * 3, spd: 70, sta: 82, val: 10 + i,
    trait: i === 2 ? 'Nervenstark' : i === 5 ? 'Talent' : null,
    isDefault: false,
    currentAtk: 55 + i * 3, currentDef: 80 - i * 3, suspended: false,
    seasonGoals: i < 3 ? 0 : i < 6 ? 1 : 3,
  }));
}

function makeMockCards() {
  return [
    { uid: 'c1', id: 'training', name: 'Trainingsboost', desc: 'Ein Spieler bekommt +8 ATK', color: 0x4ecca3, effect: 'training', target: 'own_player' },
    { uid: 'c2', id: 'derby',    name: 'Derby-Bonus',    desc: 'Team +6% Stärke',             color: 0xf39c12, effect: 'derby',    target: 'own_team'  },
    { uid: 'c3', id: 'redcard',  name: 'Rote Karte',     desc: 'Gegner gesperrt',              color: 0xe74c3c, effect: 'redcard',  target: 'opp_player' },
  ];
}

function makeMockFixtures(players) {
  return Array.from({ length: 8 }, (_, md) =>
    Array.from({ length: players.length / 2 }, (_, i) => ({
      homeId: (i * 2 + md) % players.length,
      awayId: (i * 2 + md + 1) % players.length,
    }))
  );
}

function makeMockResults() {
  return [
    {
      matchday: 1, homeId: 0, awayId: 1,
      homeName: 'Manager Alpha', awayName: 'Guardiola-KI',
      homeFormation: '4-3-3', awayFormation: '3-4-3',
      homeGoals: 2, awayGoals: 1,
      homeCS: false, awayCS: false,
      homeMOTM: { name: 'Zayden Volt', pos: 'FWD' },
      awayMOTM: { name: 'Felix Storm', pos: 'MID' },
      homeCardEffects: [
        { effect: 'training',   matchday: 1, targetPlayerId: 11, targetPlayerName: 'Zayden Volt' },
        { effect: 'derby',      matchday: 1, targetPlayerId: null, targetPlayerName: null },
      ],
      awayCardEffects: [
        { effect: 'redcard',    matchday: 1, targetPlayerId: 9, targetPlayerName: 'Kai Storm' },
      ],
      events: [
        { type: 'goal',   managerId: 0, playerId: 11, playerName: 'Zayden Volt', minute: 23 },
        { type: 'assist', managerId: 0, playerId: 9,  playerName: 'Rio Marz',    minute: 0  },
        { type: 'goal',   managerId: 1, playerId: 6,  playerName: 'Felix Storm', minute: 55 },
        { type: 'goal',   managerId: 0, playerId: 11, playerName: 'Zayden Volt', minute: 78 },
      ],
    },
    {
      matchday: 1, homeId: 2, awayId: 3,
      homeName: 'Klopp 2.0', awayName: 'Tuchel-Bot',
      homeFormation: '5-3-2', awayFormation: '4-4-2',
      homeGoals: 3, awayGoals: 1,
      homeCS: false, awayCS: false,
      homeMOTM: { name: 'Viktor Dahl', pos: 'GK' },
      awayMOTM: { name: 'Leo Beck',    pos: 'MID' },
      homeCardEffects: [],
      awayCardEffects: [],
      events: [
        { type: 'goal', managerId: 2, playerId: 20, playerName: 'Marco Renn',  minute: 12 },
        { type: 'goal', managerId: 3, playerId: 30, playerName: 'Leo Beck',    minute: 34 },
        { type: 'goal', managerId: 2, playerId: 21, playerName: 'Sven Dahl',   minute: 61 },
        { type: 'goal', managerId: 2, playerId: 20, playerName: 'Marco Renn',  minute: 87 },
      ],
    },
    {
      matchday: 1, homeId: 4, awayId: 5,
      homeName: 'Sir Alex Bot', awayName: 'Mourinho.exe',
      homeFormation: '4-4-2', awayFormation: '5-3-2',
      homeGoals: 1, awayGoals: 1,
      homeCS: false, awayCS: false,
      homeMOTM: { name: 'Nick Stone', pos: 'FWD' },
      awayMOTM: { name: 'Pat Cruz',   pos: 'DEF' },
      homeCardEffects: [],
      awayCardEffects: [],
      events: [
        { type: 'goal', managerId: 4, playerId: 40, playerName: 'Nick Stone', minute: 44 },
        { type: 'goal', managerId: 5, playerId: 50, playerName: 'Pat Cruz',   minute: 82 },
      ],
    },
  ];
}

function injectMockState(sceneKey) {
  const players = makeMockPlayers();
  const roster  = makeMockRoster(0);
  const lineup  = roster.map(p => p.id);
  const fixtures = makeMockFixtures(players);

  SocketClient.myPlayerId = 0;

  const publicBase = {
    code:            'DEBUG1',
    phase:           'prep',
    currentMatchday: 1,
    totalMatchdays:  8,
    auctionIndex:    5,
    totalAuctions:   20,
    auction:         null,
    players,
    fixtures,
    matchResults:    makeMockResults(),
    standings:       [...players].sort((a, b) => b.points - a.points),
    readyCount:      0,
    totalCount:      players.length,
    transferReadyCount: 0,
    availableTransferPlayers: [],
  };

  const privateBase = {
    playerId: 0, budget: 60,
    roster, lineup, cards: makeMockCards(),
  };

  switch (sceneKey) {
    case 'AuctionScene':
      SocketClient.publicState = {
        ...publicBase, phase: 'auction',
        auction: {
          player: { id: 45, name: 'Zayden Volt', pos: 'FWD', atk: 91, def: 48, spd: 92, sta: 80, val: 24, trait: 'Nervenstark' },
          currentBid: 18, currentBidder: 1, timeLeft: 12,
        },
      };
      SocketClient.privateState = { ...privateBase };
      break;

    case 'TeamScene':
      SocketClient.publicState  = { ...publicBase, phase: 'prep' };
      SocketClient.privateState = { ...privateBase };
      break;

    case 'MatchdayPrepScene':
      SocketClient.publicState  = { ...publicBase, phase: 'prep' };
      SocketClient.privateState = { ...privateBase };
      break;

    case 'MatchScene':
      SocketClient.publicState  = { ...publicBase, phase: 'prep' };
      SocketClient.privateState = { ...privateBase };
      break;

    case 'TableScene':
      SocketClient.publicState  = { ...publicBase, phase: 'prep' };
      SocketClient.privateState = { ...privateBase };
      break;

    case 'TransferScene':
      SocketClient.publicState  = {
        ...publicBase, phase: 'transfer',
        availableTransferPlayers: [
          { id: 46, name: 'Kai Storm',  pos: 'FWD', atk: 88, def: 52, spd: 89, sta: 76, val: 20, trait: null },
          { id: 32, name: 'Theo Wulf',  pos: 'MID', atk: 85, def: 65, spd: 88, sta: 72, val: 16, trait: 'Talent' },
          { id: 16, name: 'Hugo Kraft', pos: 'DEF', atk: 58, def: 90, spd: 65, sta: 88, val: 14, trait: 'Nervenstark' },
          { id: 9,  name: 'Emil Kurtz', pos: 'GK',  atk: 54, def: 92, spd: 62, sta: 90, val: 16, trait: 'Nervenstark' },
        ],
      };
      SocketClient.privateState = { ...privateBase };
      break;

    case 'WinnerScene':
      SocketClient.publicState  = {
        ...publicBase, phase: 'winner',
        standings: [...players]
          .sort((a, b) => b.points - a.points)
          .map(p => ({ ...p, seasonGoals: p.goalsFor, budget: p.budget })),
      };
      SocketClient.privateState = { ...privateBase };
      break;

    case 'LobbyScene':
      SocketClient.publicState  = { ...publicBase, phase: 'lobby', players: players.slice(0, 3) };
      SocketClient.privateState = { ...privateBase };
      break;

    default:
      break;
  }
}

// ── Szenen-Konfiguration ───────────────────────────────────────────────────────
const SCENES = [
  { key: 'MenuScene',         label: 'Menu',         icon: '🏠', color: 0x1a3a1a },
  { key: 'LobbyScene',        label: 'Lobby',        icon: '🚪', color: 0x1a2a3a },
  { key: 'AuctionScene',      label: 'Auktion',      icon: '💰', color: 0x2a1a00 },
  { key: 'TeamScene',         label: 'Team',         icon: '👕', color: 0x1a3a1a },
  { key: 'MatchdayPrepScene', label: 'Prep',         icon: '📋', color: 0x1a3a1a },
  { key: 'MatchScene',        label: 'Match',        icon: '⚽', color: 0x1a2a00 },
  { key: 'TableScene',        label: 'Tabelle',      icon: '📊', color: 0x1a1a3a },
  { key: 'TransferScene',     label: 'Transfer',     icon: '🔄', color: 0x2a2a00 },
  { key: 'WinnerScene',       label: 'Sieger',       icon: '🏆', color: 0x2a2000 },
];

export class DebugScene extends Phaser.Scene {
  constructor() { super({ key: 'DebugScene', active: true }); }

  create() {
    this._open  = false;
    this._objs  = [];
    this._btnG  = null;

    // F2 via globalem DOM-Event — funktioniert unabhängig von aktiver Szene
    this._keyHandler = (e) => { if (e.key === 'F2') { e.preventDefault(); this._toggle(); } };
    window.addEventListener('keydown', this._keyHandler);

    this._drawToggleBtn();
  }

  _toggle() {
    this._open = !this._open;
    if (this._open) this._drawPanel();
    else            this._closePanel();
  }

  // ── Kleiner Toggle-Button ──────────────────────────────────────────────────
  _drawToggleBtn() {
    const W = this.scale.width;
    const s = Math.min(W / 1280, this.scale.height / 720);
    const bS = Math.round(32 * s);
    const bX = W - bS - Math.round(6 * s);
    const bY = Math.round(6 * s);

    if (this._btnG) { try { this._btnG.destroy(); } catch (_) {} }
    if (this._btnT) { try { this._btnT.destroy(); } catch (_) {} }
    if (this._btnZ) { try { this._btnZ.destroy(); } catch (_) {} }

    this._btnG = this.add.graphics();
    this._btnG.fillStyle(0x061008, 0.85);
    this._btnG.fillRoundedRect(bX, bY, bS, bS, 6);
    this._btnG.lineStyle(1, 0x00c853, 0.5);
    this._btnG.strokeRoundedRect(bX, bY, bS, bS, 6);

    this._btnT = this.add.text(bX + bS / 2, bY + bS / 2, '🐛', {
      fontSize: `${Math.round(16 * s)}px`,
    }).setOrigin(0.5);

    this._btnZ = this.add.zone(bX, bY, bS, bS).setOrigin(0).setInteractive({ cursor: 'pointer' });
    this._btnZ.on('pointerover',  () => { this._btnG.clear(); this._btnG.fillStyle(0x0a2a0a, 1); this._btnG.fillRoundedRect(bX, bY, bS, bS, 6); this._btnG.lineStyle(1.5, 0x00c853, 1); this._btnG.strokeRoundedRect(bX, bY, bS, bS, 6); });
    this._btnZ.on('pointerout',   () => { this._btnG.clear(); this._btnG.fillStyle(0x061008, 0.85); this._btnG.fillRoundedRect(bX, bY, bS, bS, 6); this._btnG.lineStyle(1, 0x00c853, 0.5); this._btnG.strokeRoundedRect(bX, bY, bS, bS, 6); });
    this._btnZ.on('pointerdown',  () => this._toggle());
  }

  // ── Debug-Panel ────────────────────────────────────────────────────────────
  _drawPanel() {
    this._closePanel();

    const W  = this.scale.width, H = this.scale.height;
    const s  = Math.min(W / 1280, H / 720);
    const fs = n => `${Math.round(n * s)}px`;

    const panW  = Math.round(340 * s);
    const rowH  = Math.round(42 * s);
    const padV  = Math.round(16 * s);
    const padH  = Math.round(12 * s);
    const gap   = Math.round(6 * s);
    const panH  = padV * 2 + SCENES.length * (rowH + gap) + Math.round(36 * s);
    const panX  = W - panW - Math.round(8 * s);
    const panY  = Math.round(46 * s);

    // Backdrop
    const bd = this.add.graphics();
    bd.fillStyle(0x000000, 0.35);
    bd.fillRect(0, 0, W, H);
    this._objs.push(bd);

    // Panel background
    const pg = this.add.graphics();
    pg.fillStyle(0x061008, 0.98);
    pg.fillRoundedRect(panX, panY, panW, panH, 12);
    pg.lineStyle(2, 0x00c853, 0.8);
    pg.strokeRoundedRect(panX, panY, panW, panH, 12);
    pg.fillStyle(0x00c853, 1);
    pg.fillRect(panX + 2, panY + 2, panW - 4, Math.round(3 * s));
    this._objs.push(pg);

    // Title
    this._objs.push(this.add.text(panX + panW / 2, panY + padV, '🐛  DEBUG — SZENENAUSWAHL', {
      fontSize: fs(12), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#00c853',
    }).setOrigin(0.5, 0));
    this._objs.push(this.add.text(panX + panW / 2, panY + padV + Math.round(18 * s),
      'F2 = schließen  ·  Mock-State wird injiziert', {
        fontSize: fs(9), fontFamily: 'Rajdhani, Arial', color: '#3a6a3a',
      }).setOrigin(0.5, 0));

    // Scene buttons
    SCENES.forEach((sc, i) => {
      const by  = panY + padV + Math.round(36 * s) + i * (rowH + gap);
      const bx  = panX + padH;
      const bw  = panW - padH * 2;

      const bg2 = this.add.graphics();
      bg2.fillStyle(sc.color, 1);
      bg2.fillRoundedRect(bx, by, bw, rowH, 8);
      bg2.lineStyle(1, 0x1a4a22, 1);
      bg2.strokeRoundedRect(bx, by, bw, rowH, 8);
      this._objs.push(bg2);

      this._objs.push(this.add.text(bx + Math.round(14 * s), by + rowH / 2,
        `${sc.icon}  ${sc.label}`, {
          fontSize: fs(13), fontFamily: 'Oswald, Arial', fontStyle: 'bold', color: '#ddd',
        }).setOrigin(0, 0.5));

      // Scene key klein
      this._objs.push(this.add.text(bx + bw - Math.round(10 * s), by + rowH / 2,
        sc.key.replace('Scene', ''), {
          fontSize: fs(9), fontFamily: 'Rajdhani, Arial', color: '#3a6a3a',
        }).setOrigin(1, 0.5));

      const z = this.add.zone(bx, by, bw, rowH).setOrigin(0).setInteractive({ cursor: 'pointer' });
      z.on('pointerover',  () => { bg2.clear(); bg2.fillStyle(0x0a3a1a, 1); bg2.fillRoundedRect(bx, by, bw, rowH, 8); bg2.lineStyle(1.5, 0x00c853, 1); bg2.strokeRoundedRect(bx, by, bw, rowH, 8); });
      z.on('pointerout',   () => { bg2.clear(); bg2.fillStyle(sc.color, 1); bg2.fillRoundedRect(bx, by, bw, rowH, 8); bg2.lineStyle(1, 0x1a4a22, 1); bg2.strokeRoundedRect(bx, by, bw, rowH, 8); });
      z.on('pointerdown',  () => this._goToScene(sc.key));
      this._objs.push(z);
    });

    // Klick außerhalb = schließen
    bd.setInteractive(new Phaser.Geom.Rectangle(0, 0, W, H), Phaser.Geom.Rectangle.Contains);
    bd.on('pointerdown', (ptr) => {
      if (ptr.x < panX || ptr.x > panX + panW || ptr.y < panY || ptr.y > panY + panH) {
        this._toggle();
      }
    });
  }

  _closePanel() {
    this._objs.forEach(o => { try { o?.destroy(); } catch (_) {} });
    this._objs = [];
    this._open = false;
  }

  _goToScene(key) {
    this._closePanel();

    // Native DOM-Inputs (MenuScene) explizit entfernen
    ['fm-name-create', 'fm-name-join', 'fm-code'].forEach(id => {
      document.getElementById(id)?.remove();
    });

    // Inject mock state for scenes that need it
    if (key !== 'MenuScene') {
      injectMockState(key);
    }

    // Alle laufenden Szenen stoppen (außer DebugScene selbst)
    this.scene.manager.scenes
      .filter(s => s.sys.key !== 'DebugScene' && (s.sys.isActive() || s.sys.isSleeping()))
      .forEach(s => this.scene.stop(s.sys.key));

    // MatchScene bekommt das vollständige matchday_results-Objekt
    if (key === 'MatchScene') {
      this.scene.start(key, {
        matchday:  1,
        results:   SocketClient.publicState.matchResults,
        standings: SocketClient.publicState.standings,
        nextPhase: 'prep',
      });
    } else {
      this.scene.start(key);
    }
  }

  shutdown() {
    window.removeEventListener('keydown', this._keyHandler);
    this._closePanel();
    if (this._btnG) this._btnG.destroy();
    if (this._btnT) this._btnT.destroy();
    if (this._btnZ) this._btnZ.destroy();
  }
}
