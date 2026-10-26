// evaluator.js — the loadout scorer, ported from the offline engine (engine/evaluate.mjs + toughness.mjs)
// to run in the browser on the loaded game engine. Pure math over the engine's own functions (kitOf,
// evalLoadout, floorSetup, heroTakeHit, rng) — no re-implemented game maths. Used by Equipment Check's
// "find upgrade": score each loadout with the game's real DPS + an eHP-led survival objective whose
// elemental-resistance value stops at 55%, then greedily pick the best gear from the bag. Fight-free.

const SLOTS = ['mainhand', 'offhand', 'helm', 'chest', 'gloves', 'bracers', 'legs', 'boots', 'belt', 'amulet', 'ring1', 'ring2', 'trinket1', 'trinket2'];
const TARGETS = {
  weapon: ['mainhand', 'offhand'], shield: ['offhand'], quiver: ['offhand'],
  helm: ['helm'], chest: ['chest'], gloves: ['gloves'], bracers: ['bracers'], legs: ['legs'],
  boots: ['boots'], belt: ['belt'], amulet: ['amulet'], ring: ['ring1', 'ring2'], trinket: ['trinket1', 'trinket2'],
};
const RES = ['fireRes', 'coldRes', 'lightRes', 'chaosRes'];
const ELEMENT_RES = [['fire', 'fireRes'], ['cold', 'coldRes'], ['lightning', 'lightRes']];
const TARGET_RES = [...ELEMENT_RES, ['chaos', 'chaosRes']];
export const ELEMENT_SELECTION_CAP = 55;
const TYPES = ['phys', 'fire', 'cold', 'lightning', 'chaos'];
const hmean = xs => xs.length / xs.reduce((a, x) => a + 1 / Math.max(1, x), 0);

// ---- toughness: punishment a loadout takes, via the game's own hit resolver ----
export function makeToughness(E, state, depth = state.maxDepth, { setupSeed = 4242, soakSeed = 77, soakHits = 40, crowd = null } = {}) {
  const c = crowd || E.floorSetup({ ...state, depth }, setupSeed).crowd;
  const h = c.hero;
  const keep = { ail: JSON.stringify(h.ail), charges: JSON.stringify(h.charges), buff: JSON.stringify(h.buff) };
  const realRng = c.rng;
  function dress(kit) { c.kit = kit; h.maxHp = kit.stats.hp; h.barrierMax = kit.stats.barrier; }
  function reset(barrierFraction = 1) {
    h.hp = h.maxHp; h.barrier = h.barrierMax * barrierFraction; h.guard = 0; h.guardUntil = -1; h.owed = null; h.petrify = null;
    h.ail = JSON.parse(keep.ail); h.charges = JSON.parse(keep.charges); h.buff = JSON.parse(keep.buff);
    c.done = null; c.killer = null; c.events.length = 0;
  }
  const hit = (raw, type, kind) => E.heroTakeHit(c, raw, type === 'phys' ? 0 : 1, type, 'probe', 'probe', null, false, kind, false, false, undefined);
  function bigHit(type, tol = 1.005, barrierFraction = 1) {
    c.rng = () => 0.999999;
    const availableBarrier = type === 'chaos' ? 0 : h.barrierMax * barrierFraction;
    const pool = Math.max(10, h.maxHp + availableBarrier);
    const survives = x => { reset(barrierFraction); hit(x, type, 'attack'); return h.hp > 0; };
    let lo = pool * 0.05, hi = pool * 20;
    for (let k = 0; k < 6 && !survives(lo); k++) { hi = lo; lo /= 20; }
    for (let k = 0; k < 6 && survives(hi); k++) { lo = hi; hi *= 20; }
    for (let i = 0; i < 40 && hi / lo > tol; i++) { const mid = Math.sqrt(lo * hi); if (survives(mid)) lo = mid; else hi = mid; }
    c.rng = realRng;
    return lo;
  }
  function soak(type, big) {
    c.rng = E.rng(soakSeed); reset();
    const step = Math.max(1, big / soakHits); let raw = 0;
    for (let i = 0; i < soakHits * 10 && h.hp > 0; i++) { hit(step, type, i % 2 ? 'spell' : 'attack'); raw += step; }
    c.rng = realRng;
    return raw;
  }
  function measure(kit, { fast = false } = {}) {
    dress(kit);
    const big = {}, sk = {};
    for (const t of TYPES) { big[t] = bigHit(t, fast ? 1.01 : 1.005); if (!fast) sk[t] = soak(t, big[t]); }
    const depletedBigHit = { phys: bigHit('phys', fast ? 1.01 : 1.005, 0) };
    reset();
    const def = fast ? hmean(Object.values(big)) : Math.sqrt(hmean(Object.values(big)) * hmean(Object.values(sk)));
    const weakest = TYPES.reduce((w, t) => (big[t] < big[w] ? t : w), TYPES[0]);
    return { def, bigHit: big, depletedBigHit, soak: fast ? null : sk, weakest };
  }
  return { measure, crowd: c };
}

// ---- evaluator: off (real DPS) + selectionDef (eHP-led, 55%-capped resist objective) ----
export function makeEvaluator(E, state, { depth = state.maxDepth, toughness = null, fast = false } = {}) {
  const kit = E.kitOf(state);
  const maxDepth = state.maxDepth;
  const T = toughness || makeToughness(E, state, depth);
  const ctx = { maxDepth, kit };
  const sheetOf = eq => kit(eq).stats;
  const baseUnusable = new Set(kit(state.equipment).unusable || []);
  const cache = new WeakMap(), fastCache = new WeakMap(), selectionCache = new WeakMap();
  const measure = eq => { let m = cache.get(eq); if (!m) { m = T.measure(kit(eq)); cache.set(eq, m); } return m; };
  const measureFast = eq => { let m = fastCache.get(eq); if (!m) { m = T.measure(kit(eq), { fast: true }); fastCache.set(eq, m); } return m; };
  function selectionOf(eq) {
    let out = selectionCache.get(eq); if (out) return out;
    const s = sheetOf(eq), m = measureFast(eq);
    const resAxis = (type, key) => {
      const actualRes = Math.max(-100, Math.min(99, s[key] || 0));
      const selectionRes = Math.min(ELEMENT_SELECTION_CAP, actualRes);
      const normalized = m.bigHit[type] * (1 - actualRes / 100) / (1 - selectionRes / 100);
      const shortfall = Math.max(0, ELEMENT_SELECTION_CAP - actualRes) / ELEMENT_SELECTION_CAP;
      const underPenalty = 1 - 0.95 * shortfall;
      return Math.max(1, normalized * underPenalty);
    };
    const adjustedElements = ELEMENT_RES.map(([t, k]) => resAxis(t, k));
    const pool = Math.max(1, (s.hp || 0) + (s.barrier || 0));
    const life = Math.max(1, s.hp || 0);
    const phys = Math.max(1, m.depletedBigHit?.phys || m.bigHit.phys || 0);
    const chaos = resAxis('chaos', 'chaosRes');
    const elemental = Math.sqrt(hmean(adjustedElements) * Math.min(...adjustedElements));
    const selectionDef = Math.pow(life * pool * phys * chaos * elemental, 0.2);
    const uncapped = s.uncapped || {};
    const elementExcess = TARGET_RES.reduce((n, [, key]) => n + Math.max(0, (uncapped[key] ?? s[key] ?? 0) - ELEMENT_SELECTION_CAP), 0);
    const underResist = {};
    for (const [type, key] of TARGET_RES) { const r = s[key] || 0; if (r < ELEMENT_SELECTION_CAP) underResist[type] = Math.round(r); }
    out = { selectionDef, life, pool, phys, chaos, elemental, elementExcess, underResist: Object.keys(underResist).length ? underResist : null };
    selectionCache.set(eq, out);
    return out;
  }
  function rate(eq) {
    const k = kit(eq);
    if ((k.unusable || []).some(x => !baseUnusable.has(x))) return null;
    const r = E.evalLoadout(eq, ctx);
    if (!r || !(r.off > 0)) return null;
    const m = fast ? measureFast(eq) : measure(eq);
    const pick = selectionOf(eq);
    return { off: r.off, def: m.def, selectionDef: pick.selectionDef, elementExcess: pick.elementExcess, underResist: pick.underResist };
  }
  const statsOf = eq => {
    const s = sheetOf(eq), m = measure(eq);
    const openingOneShotAt = Object.fromEntries(Object.entries(m.bigHit).map(([t, v]) => [t, Math.round(v)]));
    const oneShotAt = { ...openingOneShotAt, phys: Math.round(m.depletedBigHit?.phys || m.bigHit.phys) };
    const over = s.uncapped || {};
    const resist = { fire: Math.round(s.fireRes || 0), cold: Math.round(s.coldRes || 0), lightning: Math.round(s.lightRes || 0), chaos: Math.round(s.chaosRes || 0) };
    const overcap = {};
    for (const [k, label] of [['fireRes', 'fire'], ['coldRes', 'cold'], ['lightRes', 'lightning'], ['chaosRes', 'chaos']]) { const raw = over[k]; if (typeof raw === 'number' && raw > (s[k] || 0)) overcap[label] = Math.round((raw - s[k]) * 10) / 10; }
    return { hp: Math.round(s.hp), barrier: Math.round(s.barrier), armor: Math.round(s.armor), dodge: Math.round((s.dodge || 0) * 10) / 10,
      block: Math.round(s.block || 0), res: RES.map(k => Math.round(s[k] || 0)).join('/'), resist,
      overcap: Object.keys(overcap).length ? overcap : null, oneShotAt, openingOneShotAt,
      ehp: Math.round((s.hp || 0) + (s.barrier || 0)) };
  };
  return { rate, statsOf, sheetStats: sheetOf, measure, measureFast, selectionOf };
}

export function bagPool(state) {
  return [...(state.inventory || []), ...Object.values(state.equipment || {}).filter(Boolean)].filter(it => it && TARGETS[it.slot]);
}
export const loadoutKey = eq => SLOTS.map(s => (eq[s] && eq[s].uid) || '-').join(',');

// ---- find upgrade: greedy per-slot hill-climb on the 20%-DPS / 80%-eHP-survival policy, fight-free ----
// Mirrors best_equip's policy pick with simValidate:false. Honours the weapon-keeps-the-skill gate so a
// non-casting weapon is never equipped, and pinned slots.
export function findUpgrade(E, state, { pinned = [], onProgress = null } = {}) {
  const ev = makeEvaluator(E, state, { fast: true });
  const POLICY_DPS = 0.2;
  const policyScore = eq => { const r = ev.rate(eq); return r ? POLICY_DPS * Math.log(Math.max(1, r.off)) + (1 - POLICY_DPS) * Math.log(Math.max(1, r.selectionDef)) : null; };
  const withItem = (eq, slot, item) => E.refuse(eq, slot, item) ? null : E.withItem(eq, slot, item, E.displaced(eq, slot, item));
  const idOf = g => (typeof g === 'string' ? g : (g && g.id));
  const kitFor = E.kitOf(state);
  const primaryId = idOf(state.hero?.groups?.[0]?.gem);
  const skillActive = (eq, id) => { const s = (kitFor(eq).skills || []).find(x => x.gem && idOf(x.gem) === id); if (!s) return false; const inact = Array.isArray(s.inactive) ? s.inactive.length : s.inactive; return !inact; };
  const weaponOk = (eq) => !primaryId || skillActive(eq, primaryId);
  const pinnedSet = new Set(pinned.flatMap(p => (TARGETS[p] || [p])));
  const pool = bagPool(state);

  let best = { ...state.equipment };
  let bestScore = policyScore(best);
  const startScore = bestScore;
  const picks = {};
  let improved = true, rounds = 0, tried = 0;
  while (improved && rounds < 4) {
    improved = false; rounds++;
    for (const it of pool) {
      for (const slot of (TARGETS[it.slot] || [it.slot])) {
        if (!SLOTS.includes(slot) || pinnedSet.has(slot)) continue;
        // never put an item into one slot when the SAME physical item is already worn in another
        // (e.g. the ring in ring2 can't be cloned into ring1). An item only "moves" to the slot it vacates.
        const wornElsewhere = SLOTS.some(sl => sl !== slot && best[sl] && best[sl].uid === it.uid);
        if (wornElsewhere) continue;
        const eq = withItem(best, slot, it); if (!eq) continue;
        if (slot === 'mainhand' && !weaponOk(eq)) continue;   // never disable the main skill
        const sc = policyScore(eq); tried++;
        if (onProgress && tried % 200 === 0) onProgress(tried);
        if (sc != null && sc > bestScore + 1e-9) { bestScore = sc; best = eq; picks[slot] = { uid: it.uid, name: it.name, rarity: it.rarity }; improved = true; }
      }
    }
  }
  const curR = ev.rate(state.equipment), bestR = ev.rate(best);
  const before = { ...ev.statsOf(state.equipment), off: Math.round(curR?.off || 0) };
  const after = { ...ev.statsOf(best), off: Math.round(bestR?.off || 0) };
  // plain-language "why": what the whole swap set improved, in the policy's own terms
  const reasons = [];
  const dOff = after.off - before.off, dHp = after.hp - before.hp, dBar = after.barrier - before.barrier, dArm = after.armor - before.armor;
  const curUnder = curR?.underResist || {}, bestUnder = bestR?.underResist || {};
  const fixedRes = Object.keys(curUnder).filter(t => (bestUnder[t] ?? 55) > curUnder[t] + 1);
  if (fixedRes.length) reasons.push(`raises under-capped ${fixedRes.join(', ')} resistance toward the 55% target`);
  if (dOff > before.off * 0.01) reasons.push(`+${Math.round((dOff / Math.max(1, before.off)) * 100)}% skill damage`);
  if (dHp > before.hp * 0.01) reasons.push(`more life`);
  if (dBar > before.barrier * 0.01) reasons.push(`more barrier`);
  if (dArm > before.armor * 0.01) reasons.push(`more armour`);
  if (!reasons.length) reasons.push(`a better overall balance of damage and survival`);
  return {
    equipment: best, changed: picks,
    gainPct: Math.round((Math.exp(bestScore - startScore) - 1) * 1000) / 10,
    before, after, reasons, tried,
  };
}
