// Gamification: daily streak, experience points, levels and badges.
// Pure functions over a plain state object; app.js persists it.
//
// The loop is deliberately gentle — a ritual, not a slot machine: one reward
// for showing up each day, small ones for engaging (rating, saving, meeting a
// new author), and badges that mark milestones of a reading life.

export const XP = { day: 10, vote: 2, save: 3, newVoice: 5, passage: 5 };

export const LEVELS = [
  { name: 'Novice', xp: 0 },
  { name: 'Seeker', xp: 60 },
  { name: 'Student', xp: 180 },
  { name: 'Scholar', xp: 400 },
  { name: 'Philosopher', xp: 800 },
  { name: 'Sage', xp: 1500 },
  { name: 'Oracle', xp: 2500 },
];

export const BADGES = [
  { id: 'first', icon: '🕯️', name: 'First light', desc: 'Opened your first thought', test: (s) => s.days >= 1 },
  { id: 'week', icon: '🔥', name: 'Seven mornings', desc: 'A 7-day streak', test: (s) => s.best >= 7 },
  { id: 'month', icon: '🏛️', name: 'A month of wisdom', desc: 'A 30-day streak', test: (s) => s.best >= 30 },
  { id: 'century', icon: '👑', name: 'Centurion', desc: 'A 100-day streak', test: (s) => s.best >= 100 },
  { id: 'back', icon: '🌱', name: 'Welcome back', desc: 'Returned after a break', test: (s) => s.comebacks >= 1 },
  { id: 'voices10', icon: '🗣️', name: 'Ten voices', desc: 'Met 10 different authors', test: (s) => s.voices >= 10 },
  { id: 'agora', icon: '🌍', name: 'The agora', desc: 'Met 40 different authors', test: (s) => s.voices >= 40 },
  { id: 'critic', icon: '⚖️', name: 'Discerning', desc: 'Rated 25 thoughts', test: (s) => s.votes >= 25 },
  { id: 'curator', icon: '📜', name: 'Curator', desc: 'Saved 10 favourites', test: (s) => s.saves >= 10 },
  { id: 'commonplace', icon: '✍️', name: 'Commonplace book', desc: 'Added 5 passages of your own', test: (s) => s.passages >= 5 },
  { id: 'polyglot', icon: '🌐', name: 'Polyglot', desc: 'Read a thought in translation', test: (s) => s.translated >= 1 },
  { id: 'explorer', icon: '🧭', name: 'Explorer', desc: 'Read thoughts from every theme', test: (s) => s.themesRead >= 11 },
];

export function emptyJourney() {
  return { xp: 0, streak: 0, best: 0, last: '', days: [], comebacks: 0, votes: 0, saves: 0, passages: 0, translated: 0, themesRead: [], badges: {} };
}

const dayDiff = (a, b) => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 86400000);

/** Register today's visit. Returns `{ gained, newDay, broken }`. */
export function visit(j, today) {
  if (j.last === today) return { gained: 0, newDay: false, broken: false };
  const gap = j.last ? dayDiff(j.last, today) : 0;
  const broken = gap > 1;
  j.streak = gap === 1 ? j.streak + 1 : 1;
  j.best = Math.max(j.best, j.streak);
  if (gap >= 3) j.comebacks++;
  j.last = today;
  j.days = [...j.days, today].slice(-366);
  j.xp += XP.day;
  return { gained: XP.day, newDay: true, broken };
}

/** The streak as it stands today (0 once a whole day has been missed). */
export function liveStreak(j, today) {
  if (!j.last) return 0;
  return dayDiff(j.last, today) <= 1 ? j.streak : 0;
}

export function levelOf(xp) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;
  const cur = LEVELS[i];
  const next = LEVELS[i + 1] || null;
  const progress = next ? (xp - cur.xp) / (next.xp - cur.xp) : 1;
  return { index: i, name: cur.name, next, progress };
}

/** Stats the badge tests read. `voices` = authors met so far. */
export function stats(j, voices) {
  return { days: j.days.length, best: j.best, comebacks: j.comebacks, voices, votes: j.votes, saves: j.saves, passages: j.passages, translated: j.translated, themesRead: j.themesRead.length };
}

/** Award any newly earned badges; returns the list of new ones. */
export function checkBadges(j, s, today) {
  const fresh = [];
  for (const b of BADGES) {
    if (!j.badges[b.id] && b.test(s)) {
      j.badges[b.id] = today;
      fresh.push(b);
    }
  }
  return fresh;
}

/** Roman numerals, for the classical date line. */
export function roman(n) {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}
