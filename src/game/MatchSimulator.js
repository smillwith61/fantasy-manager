import { GameState } from './GameState.js';

const POS_WEIGHT = { GK: { def: 1.4 }, DEF: { def: 1.1, atk: 0.3 }, MID: { atk: 0.7, def: 0.7 }, FWD: { atk: 1.3, def: 0.1 } };

export function simulateMatch(homeManagerId, awayManagerId, matchday) {
  const home = GameState.getManager(homeManagerId);
  const away = GameState.getManager(awayManagerId);

  const homeEffects = GameState.getActiveEffects(homeManagerId, matchday);
  const awayEffects = GameState.getActiveEffects(awayManagerId, matchday);

  const homeStrength = calcStrength(home, homeEffects, awayEffects, matchday);
  const awayStrength = calcStrength(away, awayEffects, homeEffects, matchday);

  // Goal calculation: strength → expected goals
  const homeXG = (homeStrength / 600) * 3.2;
  const awayXG = (awayStrength / 600) * 3.2;

  let homeGoals = poissonSample(homeXG);
  let awayGoals = poissonSample(awayXG);

  // Last-minute card
  if (homeEffects.some(e => e.effect === 'lastminute') && Math.random() < 0.6) homeGoals++;
  if (awayEffects.some(e => e.effect === 'lastminute') && Math.random() < 0.6) awayGoals++;

  const events = generateEvents(home, away, homeGoals, awayGoals, homeEffects, awayEffects);
  const homeMOTM = findMOTM(home, events, homeManagerId);
  const awayMOTM = findMOTM(away, events, awayManagerId);

  // Clean sheet check
  const homeCS = awayGoals === 0;
  const awayCS = homeGoals === 0;

  return {
    homeId: homeManagerId,
    awayId: awayManagerId,
    homeGoals,
    awayGoals,
    events,
    homeMOTM,
    awayMOTM,
    homeCS,
    awayCS,
    matchday,
  };
}

function calcStrength(mgr, ownEffects, oppEffects, matchday) {
  const lineupPlayers = mgr.lineup.map(id => mgr.roster.find(p => p.id === id)).filter(Boolean);
  let strength = 0;

  for (const pl of lineupPlayers) {
    if (pl.suspended) continue;

    let atk = pl.currentAtk ?? pl.atk;
    let def = pl.currentDef ?? pl.def;
    const sta = pl.currentSta ?? pl.sta;

    // Stamina penalty
    if (sta < 70) { atk *= 0.9; def *= 0.9; }

    // Trait: Nervenstark (+8 late season)
    if (pl.trait === 'Nervenstark' && matchday >= 6) { atk += 8; def += 8; }
    // Trait: Talent (progressive improvement)
    if (pl.trait === 'Talent') { atk += Math.min(matchday * 2, 10); def += Math.min(matchday * 2, 10); }

    // Own effects
    for (const e of ownEffects) {
      if (e.effect === 'training' && e.targetPlayerId === pl.id)   atk += 8;
      if (e.effect === 'formhigh' && e.targetPlayerId === pl.id)   { atk += 10; def += 10; }
      if (e.effect === 'talent'  && e.targetPlayerId === pl.id)    { pl.currentAtk = atk + 4; pl.currentDef = def + 4; atk += 4; def += 4; }
      if (e.effect === 'gkwall'  && pl.pos === 'GK')               def += 15;
    }

    // Opp effects on this player
    for (const e of oppEffects) {
      if (e.effect === 'injury'   && e.targetPlayerId === pl.id)   { atk -= 12; def -= 12; }
      if (e.effect === 'redcard'  && e.targetPlayerId === pl.id)   pl.suspended = true;
    }

    if (pl.suspended) continue;

    const w = POS_WEIGHT[pl.pos] ?? { atk: 0.5, def: 0.5 };
    strength += (atk * (w.atk ?? 0)) + (def * (w.def ?? 0));
  }

  // Team-wide effects
  if (ownEffects.some(e => e.effect === 'derby'))   strength *= 1.06;
  if (ownEffects.some(e => e.effect === 'homeadv')) strength += 12;
  if (oppEffects.some(e => e.effect === 'scandal'  && e.targetManagerId === mgr.id)) strength *= 0.9;

  return Math.max(strength, 50);
}

function generateEvents(home, away, homeGoals, awayGoals, homeEffects, awayEffects) {
  const events = [];
  const homeScorers = pickScorers(home, homeGoals, homeEffects);
  const awayScorers = pickScorers(away, awayGoals, awayEffects);

  for (const { scorer, assister } of homeScorers) {
    events.push({ type: 'goal',   managerId: home.id, playerId: scorer.id,   playerName: scorer.name,   minute: rnd(1, 90) });
    if (assister) events.push({ type: 'assist', managerId: home.id, playerId: assister.id, playerName: assister.name, minute: 0 });
  }
  for (const { scorer, assister } of awayScorers) {
    events.push({ type: 'goal',   managerId: away.id, playerId: scorer.id,   playerName: scorer.name,   minute: rnd(1, 90) });
    if (assister) events.push({ type: 'assist', managerId: away.id, playerId: assister.id, playerName: assister.name, minute: 0 });
  }

  events.sort((a, b) => a.minute - b.minute);
  return events;
}

function pickScorers(mgr, goals, effects) {
  const fwds = mgr.lineup.map(id => mgr.roster.find(p => p.id === id)).filter(p => p && !p.suspended && p.pos === 'FWD');
  const mids = mgr.lineup.map(id => mgr.roster.find(p => p.id === id)).filter(p => p && !p.suspended && p.pos === 'MID');
  const all  = [...fwds, ...fwds, ...mids]; // fwds weighted more
  if (all.length === 0) return [];

  const result = [];
  for (let i = 0; i < goals; i++) {
    const scorer   = all[Math.floor(Math.random() * all.length)];
    const assistPool = [...fwds, ...mids].filter(p => p !== scorer);
    const assister = assistPool.length && Math.random() > 0.3 ? assistPool[Math.floor(Math.random() * assistPool.length)] : null;
    result.push({ scorer, assister });
  }
  return result;
}

function findMOTM(mgr, events, managerId) {
  const goalCounts = {};
  for (const e of events) {
    if (e.managerId !== managerId) continue;
    if (e.type === 'goal') goalCounts[e.playerId] = (goalCounts[e.playerId] ?? 0) + 2;
    if (e.type === 'assist') goalCounts[e.playerId] = (goalCounts[e.playerId] ?? 0) + 1;
  }
  if (Object.keys(goalCounts).length === 0) {
    const squad = mgr.lineup.map(id => mgr.roster.find(p => p.id === id)).filter(Boolean);
    if (squad.length === 0) return null;
    return squad[Math.floor(Math.random() * squad.length)];
  }
  const bestId = Object.entries(goalCounts).sort((a, b) => b[1] - a[1])[0][0];
  return mgr.roster.find(p => p.id === parseInt(bestId));
}

function poissonSample(lambda) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

function rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
