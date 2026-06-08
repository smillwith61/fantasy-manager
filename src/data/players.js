// trait: null | 'Talent' | 'Nervenstark' | 'Diva' | 'Glasknoch' | 'Derbyheld' | 'Joker'
function p(id, name, pos, atk, def, spd, sta, val, trait = null) {
  return { id, name, pos, atk, def, spd, sta, val, trait };
}

export const ALL_PLAYERS = [
  // ── GOALKEEPERS ──────────────────────────────────────────────────────────
  p(1,  'Viktor Dahl',       'GK',  55, 88, 60, 85, 10, null),
  p(2,  'Marco Penz',        'GK',  50, 84, 55, 80,  8, null),
  p(3,  'Leon Falk',         'GK',  52, 90, 58, 88, 14, 'Nervenstark'),
  p(4,  'Sven Kraut',        'GK',  48, 80, 52, 78,  6, null),
  p(5,  'Tobias Hell',       'GK',  53, 86, 60, 82, 11, null),
  p(6,  'Nico Brand',        'GK',  50, 82, 55, 76,  7, null),
  p(7,  'Pascal Weis',       'GK',  55, 78, 58, 72,  6, 'Glasknoch'),
  p(8,  'Finn Hofer',        'GK',  51, 85, 56, 84,  9, null),
  p(9,  'Emil Kurtz',        'GK',  54, 92, 62, 90, 16, 'Nervenstark'),
  p(10, 'Jonas Struck',      'GK',  49, 79, 53, 77,  7, null),

  // ── DEFENDERS ────────────────────────────────────────────────────────────
  p(11, 'Bruno Kestrel',     'DEF', 65, 84, 72, 82,  9, null),
  p(12, 'Axel Prym',         'DEF', 60, 88, 68, 80, 11, null),
  p(13, 'Dario Vann',        'DEF', 70, 82, 75, 78,  8, 'Derbyheld'),
  p(14, 'Kosta Mair',        'DEF', 62, 86, 70, 85, 10, null),
  p(15, 'Remy Stolz',        'DEF', 68, 80, 73, 76,  7, null),
  p(16, 'Hugo Kraft',        'DEF', 58, 90, 65, 88, 14, 'Nervenstark'),
  p(17, 'Tariq Bode',        'DEF', 66, 78, 71, 74,  7, null),
  p(18, 'Pavel Cross',       'DEF', 72, 76, 78, 72,  8, 'Diva'),
  p(19, 'Luca Frey',         'DEF', 63, 85, 69, 83,  9, null),
  p(20, 'Nils Haas',         'DEF', 59, 82, 66, 80,  8, null),
  p(21, 'Rafael Stein',      'DEF', 74, 80, 76, 79, 10, null),
  p(22, 'Odin Lemp',         'DEF', 60, 91, 67, 90, 15, null),
  p(23, 'Sander Volk',       'DEF', 65, 83, 70, 81,  9, 'Joker'),
  p(24, 'Elias Roth',        'DEF', 67, 77, 74, 75,  8, null),
  p(25, 'Moritz Hage',       'DEF', 61, 87, 68, 86, 12, 'Talent'),
  p(26, 'Karl Dunn',         'DEF', 69, 81, 73, 79,  9, null),

  // ── MIDFIELDERS ──────────────────────────────────────────────────────────
  p(27, 'Felix Storm',       'MID', 78, 72, 80, 80, 12, null),
  p(28, 'Adan Cruz',         'MID', 82, 70, 85, 78, 14, 'Diva'),
  p(29, 'Yannick Noel',      'MID', 76, 75, 79, 82, 11, null),
  p(30, 'Cai Brandt',        'MID', 80, 68, 83, 76, 13, null),
  p(31, 'Enzo Kaul',         'MID', 74, 78, 77, 85, 12, 'Nervenstark'),
  p(32, 'Theo Wulf',         'MID', 85, 65, 88, 72, 16, 'Talent'),
  p(33, 'Dani Kerr',         'MID', 79, 71, 82, 79, 12, null),
  p(34, 'Sam Vega',          'MID', 75, 76, 78, 83, 11, null),
  p(35, 'Marc Lindt',        'MID', 81, 69, 84, 77, 14, 'Derbyheld'),
  p(36, 'Ivan Solm',         'MID', 77, 73, 81, 81, 12, null),
  p(37, 'Kian Busch',        'MID', 83, 67, 86, 74, 15, 'Glasknoch'),
  p(38, 'Noel Haug',         'MID', 72, 79, 75, 84, 10, 'Joker'),
  p(39, 'Chris Wald',        'MID', 80, 70, 83, 78, 13, null),
  p(40, 'Amos Till',         'MID', 76, 74, 79, 82, 11, null),
  p(41, 'Bene Falk',         'MID', 84, 66, 87, 73, 16, 'Diva'),
  p(42, 'Timo Renn',         'MID', 78, 72, 81, 80, 12, null),
  p(43, 'Yusuf Baum',        'MID', 73, 77, 76, 85, 11, 'Talent'),
  p(44, 'Alex Pohl',         'MID', 79, 71, 82, 77, 13, null),

  // ── FORWARDS ─────────────────────────────────────────────────────────────
  p(45, 'Zayden Volt',       'FWD', 91, 48, 92, 80, 24, 'Nervenstark'),
  p(46, 'Kai Storm',         'FWD', 88, 52, 89, 76, 20, null),
  p(47, 'Rio Marz',          'FWD', 86, 50, 87, 78, 18, 'Talent'),
  p(48, 'Emil Kane',         'FWD', 89, 45, 88, 72, 21, 'Glasknoch'),
  p(49, 'Luca Blaze',        'FWD', 84, 55, 85, 80, 16, null),
  p(50, 'Nico Spur',         'FWD', 87, 49, 90, 74, 19, 'Diva'),
  p(51, 'Dace Volt',         'FWD', 83, 56, 84, 82, 15, 'Joker'),
  p(52, 'Roel Finn',         'FWD', 85, 51, 86, 78, 17, null),
  p(53, 'Aaron Bloch',       'FWD', 90, 46, 91, 76, 22, 'Derbyheld'),
  p(54, 'Maxi Hunt',         'FWD', 82, 58, 82, 84, 15, 'Talent'),
  p(55, 'Felix Dart',        'FWD', 86, 50, 87, 74, 18, null),
  p(56, 'Theo Blitz',        'FWD', 88, 47, 89, 71, 20, 'Glasknoch'),
  p(57, 'Cleo Vance',        'FWD', 84, 54, 85, 80, 16, null),
  p(58, 'Nash Storm',        'FWD', 87, 48, 88, 73, 19, null),
  p(59, 'Remy Flair',        'FWD', 85, 52, 86, 77, 17, 'Joker'),
  p(60, 'Sven Ace',          'FWD', 83, 55, 84, 82, 15, 'Nervenstark'),
];

export function getPlayersByPosition(pos) {
  return ALL_PLAYERS.filter(p => p.pos === pos);
}

export function buildAuctionPool(numManagers) {
  // Ensure enough per position: numManagers * 1 GK, 3 DEF, 3 MID, 2 FWD + extras
  const gks  = shuffle(ALL_PLAYERS.filter(p => p.pos === 'GK')).slice(0, Math.min(numManagers + 2, 10));
  const defs = shuffle(ALL_PLAYERS.filter(p => p.pos === 'DEF')).slice(0, Math.min(numManagers * 3 + 4, 26));
  const mids = shuffle(ALL_PLAYERS.filter(p => p.pos === 'MID')).slice(0, Math.min(numManagers * 3 + 4, 18));
  const fwds = shuffle(ALL_PLAYERS.filter(p => p.pos === 'FWD')).slice(0, Math.min(numManagers * 2 + 4, 16));
  return shuffle([...gks, ...defs, ...mids, ...fwds]);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Default squad ─────────────────────────────────────────────────────────────
// Every manager (human + bot) starts with these.
// Stats are clearly below auction players (atk/def ~30–42 vs 50–92 for auction).
// IDs: 10000 + managerId * 20 + localIndex  (no collision with auction IDs 1–60)

// 11 default players — 4-3-3 formation
const DEFAULT_TEMPLATES = [
  { pos: 'GK',  atk: 14, def: 42, spd: 36, name: 'Keeper-Backup'    },
  { pos: 'DEF', atk: 24, def: 38, spd: 34, name: 'Abwehr-Res. A'    },
  { pos: 'DEF', atk: 24, def: 38, spd: 34, name: 'Abwehr-Res. B'    },
  { pos: 'DEF', atk: 24, def: 38, spd: 34, name: 'Abwehr-Res. C'    },
  { pos: 'DEF', atk: 24, def: 38, spd: 34, name: 'Abwehr-Res. D'    },
  { pos: 'MID', atk: 32, def: 30, spd: 36, name: 'Mittelfeld-Res. A' },
  { pos: 'MID', atk: 32, def: 30, spd: 36, name: 'Mittelfeld-Res. B' },
  { pos: 'MID', atk: 32, def: 30, spd: 36, name: 'Mittelfeld-Res. C' },
  { pos: 'FWD', atk: 38, def: 20, spd: 38, name: 'Sturm-Res. A'     },
  { pos: 'FWD', atk: 38, def: 20, spd: 38, name: 'Sturm-Res. B'     },
  { pos: 'FWD', atk: 38, def: 20, spd: 38, name: 'Sturm-Res. C'     },
];

export function makeDefaultSquad(managerId) {
  return DEFAULT_TEMPLATES.map((t, i) => ({
    id:        10000 + managerId * 20 + i,
    name:      t.name,
    pos:       t.pos,
    atk:       t.atk,
    def:       t.def,
    spd:       t.spd,
    sta:       70,
    val:       0,
    trait:     null,
    isDefault: true,          // flag so UI/logic can distinguish
  }));
}
