import { CLUBS } from '../data/clubs.js';
import { CARD_TYPES } from '../data/cards.js';
import { buildAuctionPool } from '../data/players.js';

export const TOTAL_MATCHDAYS = 8;
export const TRANSFER_AFTER = [3, 6]; // matchday numbers after which transfer window opens
export const START_BUDGET = 100; // millions
export const MIN_SQUAD = { GK: 1, DEF: 3, MID: 3, FWD: 2 }; // minimum lineup positions

const state = {
  numPlayers: 2,
  managers: [],       // array of manager objects
  auctionPool: [],    // players available for auction
  auctionIndex: 0,    // current player being auctioned
  currentMatchday: 0, // 0 = before first matchday
  fixtures: [],       // fixtures[matchday] = [{homeId, awayId}]
  matchResults: [],   // all played match results
  phase: 'lobby',    // lobby | auction | prep | match | table | transfer | winner
};

export const GameState = {
  // ── Setup ────────────────────────────────────────────────────────────────

  init(numPlayers) {
    state.numPlayers = numPlayers;
    state.managers = [];
    state.auctionPool = buildAuctionPool(numPlayers);
    state.auctionIndex = 0;
    state.currentMatchday = 0;
    state.fixtures = [];
    state.matchResults = [];
    state.phase = 'lobby';
  },

  addManager(name, clubId) {
    const cards = drawCards(3);
    state.managers.push({
      id: state.managers.length,
      name,
      clubId,
      clubName: CLUBS[clubId].name,
      color: CLUBS[clubId].color,
      colorHex: CLUBS[clubId].colorHex,
      budget: START_BUDGET,
      roster: [],      // player instances (copies from pool with mutable form/stamina)
      lineup: [],      // array of player ids (up to 9)
      cards,           // hand of action cards
      usedCard: null,  // card played this matchday prep
      activeEffects: [],// [{effect, targetPlayerId, matchday}]
      points: 0,
      wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0,
      seasonGoals: 0,
      seasonAssists: 0,
    });
  },

  generateFixtures() {
    const ids = state.managers.map(m => m.id);
    state.fixtures = generateRoundRobin(ids, TOTAL_MATCHDAYS);
  },

  // ── Auction ──────────────────────────────────────────────────────────────

  get auctionPool()  { return state.auctionPool; },
  get auctionIndex() { return state.auctionIndex; },
  get currentAuctionPlayer() { return state.auctionPool[state.auctionIndex] ?? null; },

  awardPlayer(managerId, playerData) {
    const mgr = state.managers[managerId];
    const instance = {
      ...playerData,
      currentAtk: playerData.atk,
      currentDef: playerData.def,
      currentSpd: playerData.spd,
      currentSta: playerData.sta,
      suspended: false,
      injured: false,
      doublePoints: false,
      seasonGoals: 0,
      seasonAssists: 0,
    };
    mgr.roster.push(instance);
    // auto-add to lineup if slot available
    if (canFitInLineup(mgr, playerData.pos)) {
      mgr.lineup.push(playerData.id);
    }
  },

  deductBudget(managerId, amount) {
    state.managers[managerId].budget -= amount;
  },

  advanceAuction() {
    state.auctionIndex++;
  },

  get auctionDone() {
    return state.auctionIndex >= state.auctionPool.length;
  },

  // ── Phase helpers ────────────────────────────────────────────────────────

  get phase()          { return state.phase; },
  set phase(v)         { state.phase = v; },
  get currentMatchday(){ return state.currentMatchday; },
  get managers()       { return state.managers; },
  get fixtures()       { return state.fixtures; },
  get matchResults()   { return state.matchResults; },
  get numPlayers()     { return state.numPlayers; },

  getManager(id)       { return state.managers[id]; },

  getFixturesForMatchday(md) {
    return state.fixtures[md - 1] ?? [];
  },

  isTransferWindow() {
    return TRANSFER_AFTER.includes(state.currentMatchday);
  },

  advanceMatchday() {
    state.currentMatchday++;
    // Draw 1 new card for each manager
    for (const mgr of state.managers) {
      mgr.usedCard = null;
      mgr.cards.push(...drawCards(1));
      if (mgr.cards.length > 5) mgr.cards = mgr.cards.slice(-5);
    }
  },

  recordMatchResult(result) {
    state.matchResults.push(result);
    // Update standings
    const home = state.managers[result.homeId];
    const away = state.managers[result.awayId];
    home.goalsFor    += result.homeGoals;
    home.goalsAgainst+= result.awayGoals;
    away.goalsFor    += result.awayGoals;
    away.goalsAgainst+= result.homeGoals;
    if (result.homeGoals > result.awayGoals) {
      home.points += 3; home.wins++;
      away.losses++;
    } else if (result.homeGoals === result.awayGoals) {
      home.points += 1; home.draws++;
      away.points += 1; away.draws++;
    } else {
      away.points += 3; away.wins++;
      home.losses++;
    }
    // Player stats
    for (const evt of result.events) {
      if (evt.type === 'goal') {
        const mgr = state.managers.find(m => m.roster.some(p => p.id === evt.playerId));
        if (mgr) {
          const pl = mgr.roster.find(p => p.id === evt.playerId);
          if (pl) pl.seasonGoals++;
          mgr.seasonGoals++;
        }
      }
      if (evt.type === 'assist') {
        const mgr = state.managers.find(m => m.roster.some(p => p.id === evt.playerId));
        if (mgr) {
          const pl = mgr.roster.find(p => p.id === evt.playerId);
          if (pl) pl.seasonAssists++;
          mgr.seasonAssists++;
        }
      }
    }
  },

  getSortedStandings() {
    return [...state.managers].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const gdA = a.goalsFor - a.goalsAgainst;
      const gdB = b.goalsFor - b.goalsAgainst;
      if (gdB !== gdA) return gdB - gdA;
      return b.goalsFor - a.goalsFor;
    });
  },

  applyCardEffect(managerId, cardId, targetManagerId = null, targetPlayerId = null) {
    const mgr = state.managers[managerId];
    const card = mgr.cards.find(c => c.id === cardId);
    if (!card) return;
    mgr.usedCard = card;
    mgr.cards = mgr.cards.filter(c => c.id !== cardId);
    mgr.activeEffects.push({
      effect: card.effect,
      targetManagerId,
      targetPlayerId,
      matchday: state.currentMatchday + 1,
    });
  },

  getActiveEffects(managerId, matchday) {
    return state.managers[managerId].activeEffects.filter(e => e.matchday === matchday);
  },

  clearMatchdayEffects(managerId, matchday) {
    const mgr = state.managers[managerId];
    mgr.activeEffects = mgr.activeEffects.filter(e => e.matchday !== matchday);
  },

  // ── Transfer window ──────────────────────────────────────────────────────

  get availableTransferPlayers() {
    const ownedIds = new Set(state.managers.flatMap(m => m.roster.map(p => p.id)));
    return state.auctionPool.filter(p => !ownedIds.has(p.id));
  },

  transferBuy(managerId, playerData, price) {
    this.awardPlayer(managerId, playerData);
    this.deductBudget(managerId, price);
  },

  transferSell(managerId, playerId, price) {
    const mgr = state.managers[managerId];
    mgr.roster = mgr.roster.filter(p => p.id !== playerId);
    mgr.lineup = mgr.lineup.filter(id => id !== playerId);
    mgr.budget += price;
  },

  lineupSet(managerId, lineup) {
    state.managers[managerId].lineup = lineup;
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────

function drawCards(n) {
  const types = CARD_TYPES;
  const drawn = [];
  for (let i = 0; i < n; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    drawn.push({ ...type, uid: Math.random().toString(36).slice(2) });
  }
  return drawn;
}

function canFitInLineup(mgr, pos) {
  const count = mgr.lineup.filter(id => {
    const pl = mgr.roster.find(p => p.id === id);
    return pl && pl.pos === pos;
  }).length;
  return count < MIN_SQUAD[pos];
}

function generateRoundRobin(ids, totalMatchdays) {
  // Generate fixtures for totalMatchdays matchdays
  // Each matchday: pair up all players, each plays one match
  const fixtures = [];
  const n = ids.length;

  if (n === 1) return Array.from({ length: totalMatchdays }, () => []);

  const rounds = [];
  const list = n % 2 === 0 ? [...ids] : [...ids, -1]; // -1 = bye
  const half = list.length / 2;

  for (let r = 0; r < list.length - 1; r++) {
    const round = [];
    for (let i = 0; i < half; i++) {
      const h = list[i];
      const a = list[list.length - 1 - i];
      if (h !== -1 && a !== -1) round.push({ homeId: h, awayId: a });
    }
    rounds.push(round);
    // rotate: keep first fixed, rotate rest
    list.splice(1, 0, list.pop());
  }

  // Fill matchdays by cycling rounds
  for (let md = 0; md < totalMatchdays; md++) {
    fixtures.push(rounds[md % rounds.length]);
  }
  return fixtures;
}
