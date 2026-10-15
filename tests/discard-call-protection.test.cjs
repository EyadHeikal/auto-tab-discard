const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '../v3/worker', file), 'utf8');
const executable = source => source.replace(/^import .*;$/gm, '').replace(/^export .*;$/gm, '');

function fixture(preferences = {}) {
  const tabs = new Map();
  const frames = new Map();
  const discarded = [];
  const mutations = [];
  const timers = new Map();
  let nextTimer = 0;
  let beforeMutation = () => {};
  let beforeDiscard = async () => {};
  let beforeMetadata = () => {};
  const prefs = {'simultaneous-jobs': 1, prepends: '', favicon: false, audio: true, ...preferences};
  const chrome = {
    tabs: {
      get: async id => ({...tabs.get(id)}),
      discard: async id => {
        discarded.push(id);
        await beforeDiscard(id);
        return {...tabs.get(id), discarded: true};
      }
    },
    scripting: {
      executeScript: async options => {
        if (options.files) {
          beforeMetadata(options);
          return frames.get(options.target.tabId).map(result => ({result}));
        }
        mutations.push(options);
        beforeMutation(options);
        return [];
      }
    }
  };
  const ctx = vm.createContext({console, chrome, prefs,
    storage: async defaults => ({...defaults, ...prefs}), log: () => {}, overlay: async () => 'data:image/png;base64,',
    setTimeout: (fn, delay) => {
      const id = ++nextTimer;
      timers.set(id, {fn, delay});
      if (delay !== 2000) queueMicrotask(() => {if (timers.delete(id)) fn();});
      return id;
    },
    clearTimeout: id => timers.delete(id)});
  vm.runInContext(executable(read('core/calls.mjs')), ctx);
  vm.runInContext(executable(read('core/discard.mjs')) + '\nthis.discard = discard;', ctx);
  return {ctx, prefs, discarded, mutations,
    tab: options => {
      const tab = {id: tabs.size + 1, active: false, discarded: false, url: 'https://example.com/', ...options};
      tabs.set(tab.id, tab);
      frames.set(tab.id, [{callActive: false, callStop: 0}]);
      return tab;
    },
    metadata: (tab, metadata) => frames.set(tab.id, metadata),
    onMutation: fn => {beforeMutation = fn;},
    onDiscard: fn => {beforeDiscard = fn;},
    onMetadata: fn => {beforeMetadata = fn;},
    enableYouTube: () => {
      const plugin = read('plugins/youtube/core.mjs').replace(/^export default \{[\s\S]*\};\s*$/m, '');
      vm.runInContext(executable(plugin) + '\nenable();', ctx);
    },
    automatic: tab => ctx.discard(tab, {automatic: true}),
    manual: tab => ctx.discard(tab),
    drain: async () => {for (let i = 0; i < 30; i++) await Promise.resolve();}
  };
}

test('automatic discard protects native capture before mutating a tab', async () => {
  const f = fixture({prepends: 'zzz', favicon: true}); const tab = f.tab({sharingState: {microphone: true}});
  await f.automatic(tab); await f.drain();
  assert.deepEqual(f.discarded, []);
  assert.deepEqual(f.mutations, []);
});
test('automatic discard protects silent active metadata from any frame', async () => {
  const f = fixture(); const tab = f.tab();
  f.metadata(tab, [{callActive: false}, {callActive: true}, {callActive: false}]);
  await f.automatic(tab); await f.drain();
  assert.deepEqual(f.discarded, []);
});
test('a capture started after the scan protects a stale tab snapshot', async () => {
  const f = fixture(); const tab = f.tab(); const scanned = {...tab};
  tab.sharingState = {camera: true};
  await f.automatic(scanned); await f.drain();
  assert.deepEqual(f.discarded, []);
});
test('a peer call started after the scan is seen by the final metadata check', async () => {
  const f = fixture(); const tab = f.tab(); const scanned = {...tab};
  f.metadata(tab, [{callActive: true}]);
  await f.automatic(scanned); await f.drain();
  assert.deepEqual(f.discarded, []);
});
test('a call started during asynchronous tab decoration cancels the final discard', async () => {
  const f = fixture({prepends: 'zzz'}); const tab = f.tab();
  f.onMutation(() => f.metadata(tab, [{callActive: true}]));
  await f.automatic(tab); await f.drain();
  assert.equal(f.mutations.length, 1);
  assert.deepEqual(f.discarded, []);
});
test('automatic discard of an ordinary idle page still works', async () => {
  const f = fixture(); const tab = f.tab();
  await f.automatic(tab); await f.drain();
  assert.deepEqual(f.discarded, [1]);
});
test('explicit manual single-tab discard retains its force behavior', async () => {
  const f = fixture(); const tab = f.tab({sharingState: {microphone: true}});
  f.metadata(tab, [{callActive: true}]);
  await f.manual(tab); await f.drain();
  assert.deepEqual(f.discarded, [1]);
});
test('disabling audio protection bypasses the automatic call guard', async () => {
  const f = fixture({audio: false}); const tab = f.tab({sharingState: {microphone: true}});
  f.metadata(tab, [{callActive: true}]);
  await f.automatic(tab); await f.drain();
  assert.deepEqual(f.discarded, [1]);
});
test('queued automatic jobs keep protection when a call begins before dequeue', async () => {
  const f = fixture(); const queued = f.tab(); const trigger = f.tab();
  f.ctx.discard.count = 2;
  await f.automatic(queued);
  f.metadata(queued, [{callActive: true}]);
  f.ctx.discard.count = 0;
  await f.manual(trigger); await f.drain();
  assert.deepEqual(f.discarded, [2]);
});
test('queued explicit manual jobs retain their force behavior', async () => {
  const f = fixture(); const queued = f.tab({sharingState: {screen: 'Screen'}}); const trigger = f.tab();
  f.ctx.discard.count = 2;
  await f.manual(queued);
  f.ctx.discard.count = 0;
  await f.manual(trigger); await f.drain();
  assert.deepEqual(f.discarded, [2, 1]);
});
for (const [site, url] of [
  ['Meet', 'https://meet.google.com/abc-defg-hij'],
  ['YouTube', 'https://www.youtube.com/watch?v=example']
]) {
  test(`enabled YouTube plugin preserves automatic call protection for ${site}`, async () => {
    const f = fixture({prepends: 'zzz'}); const tab = f.tab({url}); f.enableYouTube();
    f.onMutation(() => f.metadata(tab, [{callActive: true}]));
    await f.automatic(tab); await f.drain();
    assert.ok(f.mutations.length > 0);
    assert.deepEqual(f.discarded, []);
  });
  test(`enabled YouTube plugin waits for the final native discard of ${site}`, async () => {
    const f = fixture(); const tab = f.tab({url}); f.enableYouTube();
    let release;
    const pending = new Promise(resolve => {release = resolve;});
    f.onDiscard(() => pending);
    let settled = false;
    const operation = f.automatic(tab);
    operation.then(() => {settled = true;});
    await f.drain();
    const premature = settled;
    release(); const result = await operation; await f.drain();
    assert.deepEqual(f.discarded, [1]);
    assert.equal(premature, false, 'the discard job must not resolve before the browser operation');
    assert.equal(result, true);
  });
}
for (const [name, frames] of [
  ['undefined frame', [undefined]],
  ['null frame', [null]],
  ['an unverifiable child frame', [{callActive: false}, undefined]],
  ['a frame without call state', [{}]],
  ['a frame with invalid call state', [{callActive: 'false'}]],
  ['a nonobject frame', [0]]
]) {
  test(`automatic discard keeps a loaded page with ${name}`, async () => {
    const f = fixture(); const tab = f.tab({status: 'complete'}); f.metadata(tab, frames);
    await f.automatic(tab); await f.drain();
    assert.deepEqual(f.discarded, []);
  });
}
test('explicit manual discard permits pages with unavailable call metadata', async () => {
  const f = fixture(); const tab = f.tab({status: 'complete'}); f.metadata(tab, [undefined, null]);
  await f.manual(tab); await f.drain();
  assert.deepEqual(f.discarded, [1]);
});
test('unloaded pages remain discardable without call metadata', async () => {
  const f = fixture(); const tab = f.tab({status: 'unloaded'}); f.metadata(tab, [undefined, null]);
  await f.automatic(tab); await f.drain();
  assert.deepEqual(f.discarded, [1]);
});
for (const change of ['foreground', 'microphone']) {
  test(`automatic discard rechecks ${change} changes made while awaiting metadata`, async () => {
    const f = fixture({prepends: 'zzz', favicon: true}); const tab = f.tab();
    f.onMetadata(() => {
      if (change === 'foreground') tab.active = true;
      else tab.sharingState = {microphone: true};
    });
    await f.automatic(tab); await f.drain();
    assert.deepEqual(f.discarded, []);
    assert.deepEqual(f.mutations, []);
  });
}
