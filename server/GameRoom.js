import { buildAuctionPool, makeDefaultSquad } from '../src/data/players.js';
import { CARD_TYPES }  from '../src/data/cards.js';
import { CLUBS }       from '../src/data/clubs.js';

// Formation tactical modifiers applied to goals scored/conceded
// atk: multiplier on goals this team scores
// def: multiplier on goals opponent scores against this team
const FORMATION_TACTICS = {
  '4-3-3': { atk: 1.00, def: 1.00 },
  '4-4-2': { atk: 0.95, def: 1.07 },
  '5-3-2': { atk: 0.85, def: 1.18 },
  '4-5-1': { atk: 0.88, def: 1.15 },
  '3-5-2': { atk: 1.03, def: 0.97 },
  '3-4-3': { atk: 1.15, def: 0.88 },
};

// Out-of-position effectiveness: OOP_MULT[naturalPos][slotPos]
// 1.0 = full strength, lower = penalised
const OOP_MULT = {
  GK:  { GK: 1.00, DEF: 0.45, MID: 0.35, FWD: 0.30 },
  DEF: { GK: 0.40, DEF: 1.00, MID: 0.82, FWD: 0.68 },
  MID: { GK: 0.35, DEF: 0.85, MID: 1.00, FWD: 0.85 },
  FWD: { GK: 0.30, DEF: 0.62, MID: 0.82, FWD: 1.00 },
};

const START_BUDGET     = 100;
const TOTAL_MATCHDAYS  = 8;
const TRANSFER_AFTER   = [3, 6];
const TARGET_PLAYERS   = 8;          // always fill to 8 with bots
const MIN_SQUAD        = { GK: 1, DEF: 4, MID: 3, FWD: 3 };  // 4-3-3 = 11 players
const POS_WEIGHT       = {
  GK:  { def: 1.4 },
  DEF: { def: 1.1, atk: 0.3 },
  MID: { atk: 0.7, def: 0.7 },
  FWD: { atk: 1.3, def: 0.1 },
};

const BOT_NAMES = [
  'Guardiola-KI', 'Sir Alex Bot', 'Klopp 2.0', 'Mourinho.exe',
  'Ancelotti-AI', 'Tuchel-Bot',   'Nagelsmann v2', 'Rangnick-Pro',
];

export class GameRoom {
  constructor(code, io) {
    this.code          = code;
    this.io            = io;
    this.players       = [];
    this.phase         = 'lobby';
    this.auctionPool   = [];
    this.auctionIndex  = 0;
    this.auction       = null;
    this.currentMatchday = 0;
    this.fixtures      = [];
    this.matchResults  = [];
    this.prepData      = new Map();
    this.readyPlayers  = new Set();
    this.transferReadyPlayers = new Set();
  }

  // ── Player / bot management ───────────────────────────────────────────────

  addPlayer(socketId, name, clubId) {
    const id   = this.players.length;
    const club = CLUBS[clubId] ?? CLUBS[id % CLUBS.length];
    const player = {
      id, name, clubId,
      clubName:  club.name,
      colorHex:  club.colorHex,
      socketId,
      isBot:     false,
      isHost:    id === 0,
      budget:    START_BUDGET,
      roster:    [],
      lineup:    [],
      cards:     this.drawCards(3),
      usedCardEffects: [],
      slotAssignments: {},
      formation: '4-3-3',
      points: 0, wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0,
      seasonGoals: 0, seasonAssists: 0,
    };
    this.players.push(player);
    return player;
  }

  _addBot(name, clubId) {
    const id   = this.players.length;
    const club = CLUBS[clubId % CLUBS.length];
    const bot  = {
      id, name, clubId: clubId % CLUBS.length,
      clubName:  club.name,
      colorHex:  club.colorHex,
      socketId:  null,
      isBot:     true,
      isHost:    false,
      budget:    START_BUDGET,
      roster:    [],
      lineup:    [],
      cards:     this.drawCards(3),
      usedCardEffects: [],
      slotAssignments: {},
      formation: '4-3-3',
      points: 0, wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0,
      seasonGoals: 0, seasonAssists: 0,
    };
    this.players.push(bot);
    return bot;
  }

  _fillWithBots() {
    const usedClubs = new Set(this.players.map(p => p.clubId));
    let botIdx  = 0;
    let clubIdx = 0;
    while (this.players.length < TARGET_PLAYERS) {
      // find a club not yet used
      while (usedClubs.has(clubIdx % CLUBS.length)) clubIdx++;
      const cid = clubIdx % CLUBS.length;
      usedClubs.add(cid);
      this._addBot(BOT_NAMES[botIdx % BOT_NAMES.length], cid);
      botIdx++;
      clubIdx++;
    }
  }

  _assignDefaultSquads() {
    for (const p of this.players) {
      const squad  = makeDefaultSquad(p.id);
      p.roster  = [...squad];
      p.lineup  = squad.map(pl => pl.id);    // all 9 default players start in lineup
    }
  }

  handleDisconnect(socketId) {
    const p = this.players.find(p => p.socketId === socketId);
    if (p) p.socketId = null;
  }

  // ── Game start ────────────────────────────────────────────────────────────

  startGame() {
    console.log(`[game] startGame: ${this.players.length} human players, filling to ${TARGET_PLAYERS}`);
    this._fillWithBots();
    console.log(`[game] after fillWithBots: ${this.players.length} players total`);
    this._assignDefaultSquads();
    this.auctionPool = buildAuctionPool(this.players.length);
    this.fixtures    = generateRoundRobin(this.players.map(p => p.id), TOTAL_MATCHDAYS);
    this.phase       = 'auction';
  }

  // ── Lineup storage (from TeamScene, before prep phase) ───────────────────
  storeLineup(managerId, lineup, slotAssignments, formation) {
    const mgr = this.players[managerId];
    if (!mgr) return;
    if (lineup)          mgr.lineup          = lineup;
    if (slotAssignments) mgr.slotAssignments = slotAssignments;
    if (formation)       mgr.formation       = formation;
  }

  // ── Auction — real-time countdown ────────────────────────────────────────
  // Anyone can bid at any time. Timer counts down; a bid resets it to ≥10s.

  startNextAuction() {
    if (this._auctionTimer) { clearInterval(this._auctionTimer); this._auctionTimer = null; }

    if (this.auctionIndex >= this.auctionPool.length) {
      this.endAuctionPhase();
      return;
    }

    const player = this.auctionPool[this.auctionIndex];
    this.auction = {
      player,
      currentBid:    0,
      currentBidder: null,
      timeLeft:      20,          // seconds
    };

    this.broadcast('auction_update', this.getAuctionState());
    this._startAuctionTimer();
    this._scheduleBotBids();
  }

  _startAuctionTimer() {
    this._auctionTimer = setInterval(() => {
      if (!this.auction) { clearInterval(this._auctionTimer); return; }
      this.auction.timeLeft = Math.max(0, this.auction.timeLeft - 1);
      this.broadcast('auction_tick', { timeLeft: this.auction.timeLeft });
      if (this.auction.timeLeft <= 0) {
        clearInterval(this._auctionTimer);
        this._auctionTimer = null;
        this.finishAuction(this.auction.currentBidder);
      }
    }, 1000);
  }

  handleRaiseBid(playerId, amount) {
    const { auction } = this;
    if (!auction || auction.timeLeft <= 0) return;
    if (amount <= auction.currentBid) return;

    const pl = this.players[playerId];
    if (!pl || pl.budget < amount) return;

    auction.currentBid    = amount;
    auction.currentBidder = playerId;
    // Give at least 10 more seconds after any bid
    if (auction.timeLeft < 10) auction.timeLeft = 10;

    this.broadcast('auction_update', this.getAuctionState());

    // Let bots react to human bids
    if (!pl.isBot) this._scheduleBotReactiveBids();
  }

  skipCurrentAuction() {
    if (this._auctionTimer) { clearInterval(this._auctionTimer); this._auctionTimer = null; }
    this.auctionIndex++;
    this.auction = null;
    setTimeout(() => this.startNextAuction(), 500);
  }

  finishAuction(winnerId) {
    const { auction } = this;
    if (!auction) return;
    const auctionPlayer  = auction.player;
    const finalBid       = auction.currentBid;
    this.auction = null;

    if (winnerId !== null && winnerId !== undefined) {
      const winner = this.players[winnerId];
      if (winner && winner.budget >= finalBid && finalBid > 0) {
        this.awardPlayer(winnerId, auctionPlayer, finalBid);
        // Broadcast result WITH updated publicState so all clients see new budgets
        this.broadcast('auction_result', {
          winnerId, winnerName: winner.name,
          player: auctionPlayer, amount: finalBid,
          publicState: this.getPublicState(),
        });
        this.sendPrivateState(winner.socketId, winnerId);
      } else {
        this.broadcast('auction_result', {
          winnerId: null, player: auctionPlayer, amount: 0,
          publicState: this.getPublicState(),
        });
      }
    } else {
      this.broadcast('auction_result', {
        winnerId: null, player: auctionPlayer, amount: 0,
        publicState: this.getPublicState(),
      });
    }

    this.auctionIndex++;
    setTimeout(() => this.startNextAuction(), 2500);
  }

  endAuctionPhase() {
    if (this._auctionTimer) { clearInterval(this._auctionTimer); this._auctionTimer = null; }
    this.phase   = 'prep';
    this.auction = null;
    this.broadcast('phase_changed', { phase: 'prep', publicState: this.getPublicState() });
    this._scheduleBotPrep();
  }

  awardPlayer(managerId, playerData, price) {
    const mgr      = this.players[managerId];
    const instance = {
      ...playerData,
      currentAtk: playerData.atk,
      currentDef: playerData.def,
      suspended:  false,
      seasonGoals: 0, seasonAssists: 0,
    };
    mgr.roster.push(instance);
    mgr.budget -= price;

    // Auto-replace a default player of same position in lineup
    const defaultInLineup = mgr.lineup
      .map(id => mgr.roster.find(p => p.id === id))
      .filter(p => p?.pos === playerData.pos && p?.isDefault);

    if (defaultInLineup.length > 0) {
      const replaceId = defaultInLineup[0].id;
      mgr.lineup = mgr.lineup.map(id => id === replaceId ? playerData.id : id);
    } else {
      const posCount = mgr.lineup
        .map(id => mgr.roster.find(p => p.id === id))
        .filter(p => p?.pos === playerData.pos).length;
      if (posCount < MIN_SQUAD[playerData.pos] && mgr.lineup.length < 9) {
        mgr.lineup.push(playerData.id);
      }
    }
  }

  // ── Bot: auction ─────────────────────────────────────────────────────────

  // Called once when auction starts — each bot schedules an independent bid attempt
  _scheduleBotBids() {
    const { auction } = this;
    if (!auction) return;
    const snapPlayer = auction.player;

    this.players.filter(p => p.isBot).forEach(bot => {
      // Each bot bids at a random time within the first 15 s
      const delay = 3000 + Math.random() * 12000;
      setTimeout(() => {
        if (!this.auction || this.auction.player !== snapPlayer) return;
        if (this.auction.timeLeft <= 3) return;
        if (this.auction.currentBidder === bot.id) return;

        const dec = this._botBidDecision(bot, this.auction);
        if (dec.bid) this.handleRaiseBid(bot.id, dec.amount);
      }, delay);
    });
  }

  // Called when a human bids — lets bots react
  _scheduleBotReactiveBids() {
    const { auction } = this;
    if (!auction) return;
    const snapPlayer = auction.player;

    this.players.filter(p => p.isBot).forEach(bot => {
      const delay = 1800 + Math.random() * 3500;
      setTimeout(() => {
        if (!this.auction || this.auction.player !== snapPlayer) return;
        if (this.auction.timeLeft <= 3) return;
        if (this.auction.currentBidder === bot.id) return;

        const dec = this._botBidDecision(bot, this.auction);
        if (dec.bid) this.handleRaiseBid(bot.id, dec.amount);
      }, delay);
    });
  }

  _botBidDecision(bot, auction) {
    const { player, currentBid } = auction;
    const nextBid = Math.max(currentBid + 1, 1);

    if (nextBid > bot.budget) return { bid: false };

    // How many REAL (non-default) players does bot have for this position?
    const realForPos = bot.roster.filter(p => !p.isDefault && p.pos === player.pos).length;
    const stillNeeds = realForPos < MIN_SQUAD[player.pos];
    const wouldLike  = realForPos < MIN_SQUAD[player.pos] + 1;

    // Player quality relative to auction pool (atk+def+spd normalised to ~99*3)
    const quality = (player.atk + player.def + player.spd) / 297;

    // Max price bot is willing to pay
    const urgencyMult = stillNeeds ? 1.3 : (wouldLike ? 0.8 : 0.45);
    const maxWilling  = Math.floor(
      Math.min(
        bot.budget * (stillNeeds ? 0.50 : 0.28),
        player.val * urgencyMult * (0.85 + quality * 0.3 + Math.random() * 0.2)
      )
    );

    if (nextBid > maxWilling) return { bid: false };

    // Bid probability: high when urgent, low for luxury purchases
    const prob = stillNeeds ? 0.75 : (wouldLike ? 0.45 : 0.20);
    if (Math.random() > prob) return { bid: false };

    return { bid: true, amount: nextBid };
  }

  // ── Matchday prep (Civ-style) ─────────────────────────────────────────────

  submitPrep(playerId, lineup, cardUid, targetManagerId, targetPlayerId) {
    this.prepData.set(playerId, { lineup, cardUid, targetManagerId, targetPlayerId });
    const mgr = this.players[playerId];
    if (mgr && lineup) mgr.lineup = lineup;
    this.broadcast('prep_submitted', {
      playerId,
      submittedCount: this.prepData.size,
      totalCount:     this.players.length,
    });
  }

  markReady(playerId) {
    this.readyPlayers.add(playerId);
    this.broadcast('player_ready', {
      playerId,
      readyCount:  this.readyPlayers.size,
      totalCount:  this.players.length,
      playerName:  this.players[playerId]?.name,
    });

    if (this.readyPlayers.size >= this.players.length) {
      this.runMatchday();
    }
  }

  _scheduleBotPrep() {
    const bots = this.players.filter(p => p.isBot);
    bots.forEach((bot, i) => {
      const delay = 2500 + i * 700 + Math.random() * 2000;
      setTimeout(() => {
        if (this.phase !== 'prep') return;
        const lineup = this._botBestLineup(bot);
        this.submitPrep(bot.id, lineup, null, null, null);
        setTimeout(() => {
          if (this.phase !== 'prep') return;
          this.markReady(bot.id);
        }, 600 + Math.random() * 900);
      }, delay);
    });
  }

  _botBestLineup(bot) {
    const lineup = [];
    for (const [pos, count] of Object.entries(MIN_SQUAD)) {
      const best = bot.roster
        .filter(p => p.pos === pos && !p.suspended)
        .sort((a, b) => {
          const sa = (a.currentAtk ?? a.atk) + (a.currentDef ?? a.def) + (a.isDefault ? 0 : 20);
          const sb = (b.currentAtk ?? b.atk) + (b.currentDef ?? b.def) + (b.isDefault ? 0 : 20);
          return sb - sa;
        })
        .slice(0, count);
      lineup.push(...best.map(p => p.id));
    }
    return lineup;
  }

  runMatchday() {
    this.currentMatchday++;
    const md = this.currentMatchday;

    // Apply card effects
    for (const [playerId, data] of this.prepData.entries()) {
      if (data.cardUid) {
        const mgr  = this.players[playerId];
        const card = mgr.cards.find(c => c.uid === data.cardUid);
        if (card) {
          mgr.usedCardEffects.push({
            matchday: md, effect: card.effect,
            targetManagerId: data.targetManagerId ?? null,
            targetPlayerId:  data.targetPlayerId  ?? null,
          });
          mgr.cards = mgr.cards.filter(c => c.uid !== data.cardUid);
        }
      }
    }

    // Simulate all fixtures
    const fixtures = this.fixtures[md - 1] ?? [];
    const results  = fixtures.map(f => this.simulateMatch(f.homeId, f.awayId, md));
    results.forEach(r => this.updateStandings(r));
    this.matchResults.push(...results);

    // Draw new cards, reset prep
    for (const p of this.players) {
      const newCard = this.drawCards(1)[0];
      p.cards.push(newCard);
      if (p.cards.length > 5) p.cards = p.cards.slice(-5);
      this.sendPrivateState(p.socketId, p.id);
    }
    this.prepData.clear();
    this.readyPlayers.clear();

    const isLast      = md >= TOTAL_MATCHDAYS;
    const isTransfer  = TRANSFER_AFTER.includes(md);
    const nextPhase   = isLast ? 'winner' : (isTransfer ? 'transfer' : 'prep');
    this.phase        = nextPhase;

    this.broadcast('matchday_results', {
      matchday: md, results,
      standings:   this.getSortedStandings(),
      nextPhase,
      publicState: this.getPublicState(),
    });

    if (nextPhase === 'transfer') {
      this.transferReadyPlayers = new Set();
      this._scheduleBotTransfers();
    } else if (nextPhase === 'prep') {
      this._scheduleBotPrep();
    }
  }

  // ── Match simulation ──────────────────────────────────────────────────────

  simulateMatch(homeId, awayId, matchday) {
    const home = this.players[homeId];
    const away = this.players[awayId];

    const homeEffects = home.usedCardEffects.filter(e => e.matchday === matchday);
    const awayEffects = away.usedCardEffects.filter(e => e.matchday === matchday);

    const homeStr = this.calcStrength(home, homeEffects, awayEffects, matchday);
    const awayStr = this.calcStrength(away, awayEffects, homeEffects, matchday);

    // Apply formation tactics: each team's attacking output vs opponent's defensive shape
    const homeTac = FORMATION_TACTICS[home.formation ?? '4-3-3'] ?? FORMATION_TACTICS['4-3-3'];
    const awayTac = FORMATION_TACTICS[away.formation ?? '4-3-3'] ?? FORMATION_TACTICS['4-3-3'];

    let homeGoals = poissonSample((homeStr / 600) * 3.2 * homeTac.atk / awayTac.def);
    let awayGoals = poissonSample((awayStr  / 600) * 3.2 * awayTac.atk / homeTac.def);

    if (homeEffects.some(e => e.effect === 'lastminute') && Math.random() < 0.6) homeGoals++;
    if (awayEffects.some(e => e.effect === 'lastminute') && Math.random() < 0.6) awayGoals++;

    const events   = this.generateEvents(home, away, homeGoals, awayGoals);
    const homeMOTM = this.findMOTM(home, events, homeId);
    const awayMOTM = this.findMOTM(away, events, awayId);

    // Enrich card effects with player names (look in both rosters)
    const allPlayers = [...home.roster, ...away.roster];
    const enrichEffects = effects => effects.map(e => ({
      ...e,
      targetPlayerName: e.targetPlayerId
        ? (allPlayers.find(p => p.id === e.targetPlayerId)?.name ?? null)
        : null,
    }));

    return {
      homeId, awayId, homeGoals, awayGoals,
      homeName: home.name, awayName: away.name,
      homeFormation:    home.formation ?? '4-3-3',
      awayFormation:    away.formation ?? '4-3-3',
      homeCS: awayGoals === 0, awayCS: homeGoals === 0,
      homeCardEffects:  enrichEffects(homeEffects),
      awayCardEffects:  enrichEffects(awayEffects),
      events,
      homeMOTM: homeMOTM ? { name: homeMOTM.name, pos: homeMOTM.pos } : null,
      awayMOTM:  awayMOTM  ? { name: awayMOTM.name,  pos: awayMOTM.pos  } : null,
      matchday,
    };
  }

  calcStrength(mgr, ownEffects, oppEffects, matchday) {
    const lineup = mgr.lineup.map(id => mgr.roster.find(p => p.id === id)).filter(Boolean);
    let strength = 0;

    for (const pl of lineup) {
      if (pl.suspended) continue;
      let atk = pl.currentAtk ?? pl.atk;
      let def = pl.currentDef ?? pl.def;

      // Trait bonuses
      if (pl.trait === 'Nervenstark' && matchday >= 6) { atk += 8; def += 8; }
      if (pl.trait === 'Talent') { atk += Math.min(matchday * 2, 10); def += Math.min(matchday * 2, 10); }
      if (pl.sta < 70) { atk *= 0.9; def *= 0.9; }

      // Own card effects
      for (const e of ownEffects) {
        if (e.effect === 'training' && e.targetPlayerId === pl.id) atk += 8;
        if (e.effect === 'formhigh' && e.targetPlayerId === pl.id) { atk += 10; def += 10; }
        if (e.effect === 'talent'   && e.targetPlayerId === pl.id) {
          pl.currentAtk = (pl.currentAtk ?? pl.atk) + 4;
          pl.currentDef = (pl.currentDef ?? pl.def) + 4;
          atk += 4; def += 4;
        }
        if (e.effect === 'gkwall' && pl.pos === 'GK') def += 15;
      }

      // Opponent card effects
      for (const e of oppEffects) {
        if (e.effect === 'injury'  && e.targetPlayerId === pl.id) { atk -= 12; def -= 12; }
        if (e.effect === 'redcard' && e.targetPlayerId === pl.id) { pl.suspended = true; continue; }
      }
      if (pl.suspended) continue;

      // Out-of-position penalty: use slot the player was assigned to, not natural pos
      const slotPos = mgr.slotAssignments?.[pl.id] ?? pl.pos;
      const oopMult = OOP_MULT[pl.pos]?.[slotPos] ?? 1.0;

      // Stat weights are based on the SLOT position (what the role demands),
      // but the player's actual values are reduced by the OOP multiplier
      const w = POS_WEIGHT[slotPos] ?? POS_WEIGHT[pl.pos] ?? { atk: 0.5, def: 0.5 };
      strength += ((atk * (w.atk ?? 0)) + (def * (w.def ?? 0))) * oopMult;
    }

    if (ownEffects.some(e => e.effect === 'derby'))   strength *= 1.06;
    if (ownEffects.some(e => e.effect === 'homeadv')) strength += 12;
    if (oppEffects.some(e => e.effect === 'scandal' && e.targetManagerId === mgr.id)) strength *= 0.9;

    return Math.max(strength, 50);
  }

  generateEvents(home, away, homeGoals, awayGoals) {
    const pick = (mgr, n) => {
      const fwds = mgr.lineup.map(id => mgr.roster.find(p => p.id === id))
        .filter(p => p && !p.suspended && p.pos === 'FWD');
      const mids = mgr.lineup.map(id => mgr.roster.find(p => p.id === id))
        .filter(p => p && !p.suspended && p.pos === 'MID');
      const pool = [...fwds, ...fwds, ...mids];
      if (!pool.length) return [];
      return Array.from({ length: n }, () => {
        const scorer   = pool[Math.floor(Math.random() * pool.length)];
        const assistPool = [...fwds, ...mids].filter(p => p !== scorer);
        const assister = assistPool.length && Math.random() > 0.3
          ? assistPool[Math.floor(Math.random() * assistPool.length)] : null;
        return { scorer, assister };
      });
    };

    const events = [];
    pick(home, homeGoals).forEach(({ scorer, assister }) => {
      events.push({ type: 'goal',   managerId: home.id, playerId: scorer.id,   playerName: scorer.name,   minute: rnd(1, 90) });
      if (assister) events.push({ type: 'assist', managerId: home.id, playerId: assister.id, playerName: assister.name, minute: 0 });
    });
    pick(away, awayGoals).forEach(({ scorer, assister }) => {
      events.push({ type: 'goal',   managerId: away.id, playerId: scorer.id,   playerName: scorer.name,   minute: rnd(1, 90) });
      if (assister) events.push({ type: 'assist', managerId: away.id, playerId: assister.id, playerName: assister.name, minute: 0 });
    });

    events.forEach(e => {
      const mgr = this.players[e.managerId];
      if (!mgr) return;
      const pl = mgr.roster.find(p => p.id === e.playerId);
      if (e.type === 'goal')   { if (pl) pl.seasonGoals++;   mgr.seasonGoals++;   }
      if (e.type === 'assist') { if (pl) pl.seasonAssists++; mgr.seasonAssists++; }
    });

    return events.sort((a, b) => a.minute - b.minute);
  }

  findMOTM(mgr, events, managerId) {
    const counts = {};
    events.filter(e => e.managerId === managerId).forEach(e => {
      counts[e.playerId] = (counts[e.playerId] ?? 0) + (e.type === 'goal' ? 2 : 1);
    });
    const entries = Object.entries(counts);
    if (!entries.length) {
      const squad = mgr.lineup.map(id => mgr.roster.find(p => p.id === id)).filter(Boolean);
      return squad[Math.floor(Math.random() * squad.length)] ?? null;
    }
    const bestId = entries.sort((a, b) => b[1] - a[1])[0][0];
    return mgr.roster.find(p => p.id === parseInt(bestId)) ?? null;
  }

  updateStandings(result) {
    const home = this.players[result.homeId];
    const away = this.players[result.awayId];
    home.goalsFor     += result.homeGoals;
    home.goalsAgainst += result.awayGoals;
    away.goalsFor     += result.awayGoals;
    away.goalsAgainst += result.homeGoals;

    if      (result.homeGoals > result.awayGoals)  { home.points += 3; home.wins++;  away.losses++; }
    else if (result.homeGoals === result.awayGoals) { home.points += 1; home.draws++; away.points += 1; away.draws++; }
    else                                            { away.points += 3; away.wins++;  home.losses++; }
  }

  // ── Transfer window ───────────────────────────────────────────────────────

  handleBuyPlayer(managerId, playerId) {
    const ownedIds = new Set(this.players.flatMap(m => m.roster.map(p => p.id)));
    const pl  = this.auctionPool.find(p => p.id === playerId && !ownedIds.has(p.id));
    const mgr = this.players[managerId];
    if (!pl || !mgr || mgr.budget < pl.val) return;
    this.awardPlayer(managerId, pl, pl.val);
    this.sendPrivateState(mgr.socketId, managerId);
    this.broadcast('transfer_update', { publicState: this.getPublicState() });
  }

  handleSellPlayer(managerId, playerId) {
    const mgr = this.players[managerId];
    if (!mgr) return;
    const pl = mgr.roster.find(p => p.id === playerId);
    if (!pl || pl.isDefault) return;    // can't sell default players
    const sellPrice = Math.floor(pl.val * 0.8);
    mgr.roster = mgr.roster.filter(p => p.id !== playerId);
    mgr.lineup = mgr.lineup.filter(id => id !== playerId);

    // If lineup is now missing a position, fill with default for that pos
    const posInLineup = mgr.lineup
      .map(id => mgr.roster.find(p => p.id === id))
      .filter(p => p?.pos === pl.pos).length;
    if (posInLineup < MIN_SQUAD[pl.pos]) {
      const backup = mgr.roster.find(p => p.pos === pl.pos && p.isDefault &&
        !mgr.lineup.includes(p.id));
      if (backup) mgr.lineup.push(backup.id);
    }

    mgr.budget += sellPrice;
    this.sendPrivateState(mgr.socketId, managerId);
    this.broadcast('transfer_update', { publicState: this.getPublicState() });
  }

  markTransferReady(playerId) {
    this.transferReadyPlayers.add(playerId);
    this.broadcast('transfer_player_ready', {
      playerId,
      readyCount:  this.transferReadyPlayers.size,
      totalCount:  this.players.length,
      playerName:  this.players[playerId]?.name,
    });

    if (this.transferReadyPlayers.size >= this.players.length) {
      this.phase = 'prep';
      this.transferReadyPlayers.clear();
      this.broadcast('phase_changed', { phase: 'prep', publicState: this.getPublicState() });
      this._scheduleBotPrep();
    }
  }

  _scheduleBotTransfers() {
    const bots = this.players.filter(p => p.isBot);
    bots.forEach((bot, i) => {
      const delay = 1500 + i * 500 + Math.random() * 1500;
      setTimeout(() => {
        if (this.phase !== 'transfer') return;
        this._botMaybeTransfer(bot);
        setTimeout(() => {
          if (this.phase !== 'transfer') return;
          this.markTransferReady(bot.id);
        }, 800 + Math.random() * 1200);
      }, delay);
    });
  }

  _botMaybeTransfer(bot) {
    if (bot.budget < 5 || Math.random() < 0.25) return;
    const available = this.getAvailableTransferPlayers();
    if (!available.length) return;

    // Count real (non-default) players per position
    const realCount = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    bot.roster.filter(p => !p.isDefault).forEach(p => realCount[p.pos]++);

    // Prioritise weakest position
    const [weakPos] = Object.entries(realCount).sort((a, b) => a[1] - b[1]);
    const pos = weakPos[0];

    const candidates = available
      .filter(p => p.pos === pos && p.val <= bot.budget * 0.45)
      .sort((a, b) => (b.atk + b.def + b.spd) - (a.atk + a.def + a.spd));

    if (candidates.length) {
      this.handleBuyPlayer(bot.id, candidates[0].id);
    }
  }

  // ── State serialisation ───────────────────────────────────────────────────

  getPublicState() {
    return {
      code:             this.code,
      phase:            this.phase,
      currentMatchday:  this.currentMatchday,
      totalMatchdays:   TOTAL_MATCHDAYS,
      auctionIndex:     this.auctionIndex,
      totalAuctions:    this.auctionPool.length,
      auction:          this.getAuctionState(),
      players:          this.players.map(p => this.getPlayerPublic(p)),
      fixtures:         this.fixtures,
      matchResults:     this.matchResults,
      standings:        this.getSortedStandings(),
      readyCount:       this.readyPlayers.size,
      totalCount:       this.players.length,
      transferReadyCount: this.transferReadyPlayers?.size ?? 0,
      availableTransferPlayers: this.getAvailableTransferPlayers(),
    };
  }

  getAuctionState() {
    if (!this.auction) return null;
    return {
      player:        this.auction.player,
      currentBid:    this.auction.currentBid,
      currentBidder: this.auction.currentBidder,
      timeLeft:      this.auction.timeLeft,
    };
  }

  getPlayerPublic(p) {
    return {
      id: p.id, name: p.name, clubId: p.clubId,
      clubName: p.clubName, colorHex: p.colorHex,
      budget: p.budget, rosterSize: p.roster.length,
      lineupSize: p.lineup.length, cardCount: p.cards.length,
      points: p.points, wins: p.wins, draws: p.draws, losses: p.losses,
      goalsFor: p.goalsFor, goalsAgainst: p.goalsAgainst,
      seasonGoals: p.seasonGoals,
      formation: p.formation ?? '4-3-3',
      isHost: p.isHost,
      isBot:  p.isBot,
      connected: p.isBot ? true : Boolean(p.socketId),
    };
  }

  getPrivateState(playerId) {
    const p = this.players[playerId];
    if (!p) return null;
    return { playerId, budget: p.budget, roster: p.roster, lineup: p.lineup, cards: p.cards };
  }

  getSortedStandings() {
    return [...this.players]
      .sort((a, b) =>
        b.points !== a.points ? b.points - a.points :
        (b.goalsFor - b.goalsAgainst) !== (a.goalsFor - a.goalsAgainst)
          ? (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst)
          : b.goalsFor - a.goalsFor)
      .map(p => this.getPlayerPublic(p));
  }

  getAvailableTransferPlayers() {
    const owned = new Set(this.players.flatMap(m => m.roster.map(p => p.id)));
    return this.auctionPool.filter(p => !owned.has(p.id));
  }

  getPlayerPublicById(id) {
    const p = this.players[id];
    return p ? this.getPlayerPublic(p) : null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  broadcast(event, data) {
    this.io.to(this.code).emit(event, data);
  }

  sendPrivateState(socketId, playerId) {
    if (!socketId) return;
    this.io.to(socketId).emit('private_state', this.getPrivateState(playerId));
  }

  sendAllPrivateStates() {
    for (const p of this.players) {
      this.sendPrivateState(p.socketId, p.id);
    }
  }

  drawCards(n) {
    return Array.from({ length: n }, () => ({
      ...CARD_TYPES[Math.floor(Math.random() * CARD_TYPES.length)],
      uid: Math.random().toString(36).slice(2),
    }));
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function poissonSample(lambda) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

function rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

function generateRoundRobin(ids, totalMatchdays) {
  const list = ids.length % 2 === 0 ? [...ids] : [...ids, -1];
  const half = list.length / 2;
  const rounds = [];

  for (let r = 0; r < list.length - 1; r++) {
    const round = [];
    for (let i = 0; i < half; i++) {
      const h = list[i], a = list[list.length - 1 - i];
      if (h !== -1 && a !== -1) round.push({ homeId: h, awayId: a });
    }
    rounds.push(round);
    list.splice(1, 0, list.pop());
  }

  return Array.from({ length: totalMatchdays }, (_, i) => rounds[i % rounds.length]);
}
