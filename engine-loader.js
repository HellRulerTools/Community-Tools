// engine-loader.js — load the game's own engine in the browser, from the minimal chunk bundle.
//
// The game is a browser game, so its computation code runs natively here: no Node, no re-implementation.
// We import the bundled chunks (tools/engine/<build>/, see engine/export_engine_bundle.mjs), then locate
// the kit builder, DPS evaluator and hit resolver by a signature in their own minified source — the same
// way the offline Node engine does — because export letters and chunk names change every patch, these
// code shapes don't. Returns the engine functions, or throws with a clear message.
//
//   import { loadBrowserEngine } from './engine-loader.js';
//   const E = await loadBrowserEngine();         // { build, treeId, kitOf, evalLoadout, heroTakeHit, ... }
//   const kit = E.kitOf(state); const stats = kit(state.equipment).stats;
//
// Read-only towards the game. Loads static files only.
export const ENGINE_BASE = 'engine/';   // where manifest.json + <build>/ live, relative to the tool page

const SIGS = {
  kitOf: [/new WeakMap;return (\w+)=>\{let (\w+)=\w+\.get\(\1\);return \2\|\|\(\2=\w+\(\{\.\.\.\w+,equipment:\1\}\),/, 300],
  evalLoadout: [/\.kit\?\.\(\w+\)[\s\S]{0,200}maxDepth[\s\S]{0,200}return\{off:/, 400],
  refuse: [/a quiver is worn only beside a bow/, 400],
  displaced: [/===`mainhand`&&\w+\.offhand\)\{let \w+=\w+\.offhand;/, 800],
  withItem: [/\{let (\w+)=\{\.\.\.\w+\};for\(let (\w+) of \w+\)delete \1\[\2\.slot\];return \1\[\w+\]=\w+,\1\}/, 200],
  treeCheck: [/claim a start on the tree first/, 4000],
  rng: [/\+1831565813\|0;let \w=Math\.imul/, 300],
  nodeCost: [/\?\.hub\?0:[\w$]+\(\(\w\?[\w$]+\(\w\)\.get\(\w\):void 0\)\?\?1\)/, 200],
  ascendCheck: [/that ascendancy belongs to another start/, 1500],
  // a prepared floor (crowd + hero) — toughness.mjs re-dresses its hero with each loadout's kit
  floorSetup: [/\{crowd:\w+\(\{kit:\w+,depth:\w+\.depth,seed:/, 3000],
  // one floor fight (for the DPS/survival tester, later)
  fightFloor: [/^function \w+\(e,t\)\{let\{crowd:n,enemy:r,loot:i,rng:a\}=\w+\(e,t\),o=\{rng:a,enemy:r,crowd:n,loot:i,log:\[\],seed:t\}/, Infinity],
};

let _engine = null;        // cached across callers
let _loading = null;

// resolve to an ABSOLUTE url against the page, so dynamic import() doesn't treat it as a bare specifier
export function engineBase(path) { return new URL(ENGINE_BASE.replace(/\/$/, '') + '/' + path.replace(/^\//, ''), document.baseURI).href; }

async function doLoad(onProgress) {
  const manifest = await fetch(engineBase('manifest.json')).then(r => { if (!r.ok) throw new Error('engine bundle not found (manifest.json ' + r.status + ')'); return r.json(); });
  const dir = engineBase(manifest.build + '/');
  const chunks = manifest.chunks;
  const mods = {}, errors = {};
  let done = 0;
  // import chunks; relative deps between them resolve from the same dir. Load sequentially so a failing
  // chunk is clearly attributable, and progress is reportable.
  for (const f of chunks) {
    try { mods[f] = await import(/* @vite-ignore */ dir + f); }
    catch (e) { errors[f] = String(e).slice(0, 160); }
    if (onProgress) onProgress(++done, chunks.length);
  }
  // collect exposed internals (__hr_*) and signature matches
  const found = {};
  for (const m of Object.values(mods)) for (const [k, v] of Object.entries(m)) if (k.startsWith('__hr_')) found[k.slice(5)] = v;
  for (const m of Object.values(mods)) {
    for (const v of Object.values(m)) {
      if (typeof v !== 'function') continue;
      const src = Function.prototype.toString.call(v);
      for (const [k, [re, max]] of Object.entries(SIGS)) {
        if (!found[k] && src.length <= max && re.test(src.slice(0, 4000))) found[k] = v;
      }
    }
  }
  if (!found.kitOf || !found.evalLoadout) {
    const miss = ['kitOf', 'evalLoadout'].filter(k => !found[k]);
    throw new Error('engine loaded but missing ' + miss.join(', ') + ' — the game likely changed; the bundle/signatures need refreshing. (' + Object.keys(errors).length + ' chunk load errors)');
  }
  return { build: manifest.build, treeId: manifest.treeId, chunkErrors: errors, ...found };
}

export function loadBrowserEngine(onProgress) {
  if (_engine) return Promise.resolve(_engine);
  if (!_loading) _loading = doLoad(onProgress).then(e => (_engine = e)).catch(err => { _loading = null; throw err; });
  return _loading;
}
