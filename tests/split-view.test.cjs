const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '../v3', file), 'utf8');
const executable = file => read(file).replace(/^import .*;$/gm, '').replace(/^export .*;$/gm, '');
const watch = read('data/inject/watch.js');
const meta = read('data/inject/meta.js');
const minute = 60000;

function fixture(preferences = {}) {
  let now = 1700000000000;
  const tabs = [];
  const pages = new Map();
  const discarded = [];
  const prefs = {period: 60, number: 0, 'split-view': true, ...preferences};
  const noop = () => {};
  const event = {addListener: noop};
  const clock = class extends Date {static now() {return now;}};
  const addTab = ({memory, ...options} = {}) => {
    const tab = {id: tabs.length + 1, active: false, audible: false, discarded: false, status: 'complete',
      autoDiscardable: true, groupId: -1, splitViewId: -1, url: 'https://example.com/' + tabs.length, ...options};
    const listeners = [];
    const document = {visibilityState: 'hidden', readyState: 'complete', querySelectorAll: () => [],
      addEventListener: noop, dispatchEvent: () => true};
    const page = vm.createContext({Date: clock, Event: class {}, document,
      performance: {timing: {domLoading: now}, memory: memory && {totalJSHeapSize: memory}},
      addEventListener: (name, fn) => name === 'visibilitychange' && listeners.push(fn)});
    vm.runInContext('this.window = this; this.top = this;', page);
    vm.runInContext(watch, page);
    tabs.push(tab);
    pages.set(tab.id, page);
    const visibility = state => {
      document.visibilityState = state;
      listeners.forEach(fn => fn());
    };
    return {tab, show: () => visibility('visible'), hide: () => visibility('hidden')};
  };
  const background = vm.createContext({console, Date: clock, log: noop, match: () => false,
    icon: {disabled: noop, reset: noop}, starters: [], interrupts: {'before-action': async () => {}},
    storage: async defaults => ({...defaults, ...prefs}),
    discard: tab => {discarded.push(tab.id);},
    query: async filter => tabs.filter(tab => Object.entries(filter).every(([key, value]) =>
      key === 'url' || tab[key] === value)),
    chrome: {alarms: {create: noop, clear: noop, onAlarm: event}, idle: {onStateChanged: event},
      commands: {onCommand: event}, storage: {onChanged: event},
      scripting: {executeScript: async ({target}) => [{result: vm.runInContext(meta, pages.get(target.tabId))}]}}});
  vm.runInContext(executable('worker/core/calls.mjs'), background);
  vm.runInContext(executable('worker/modes/number.mjs') + '\nthis.number = number;', background);
  return {addTab, discarded, advance: duration => {now += duration;},
    check: () => background.number.check(),
    manual: () => background.number.check(undefined, background.number.IGNORE)};
}

test('automatic discard skips a page that Zen shows beside the focused tab in a split view', async () => {
  const f = fixture();
  f.addTab({active: true, groupId: 7});
  f.addTab({groupId: 7}).show();
  f.addTab();
  f.advance(2 * minute); await f.check();
  assert.deepEqual(f.discarded, [3]);
});
test('the memory limit does not discard a page shown in a Zen split view', async () => {
  const f = fixture({'memory-enabled': true, 'memory-value': 1});
  f.addTab({active: true, groupId: 7});
  f.addTab({groupId: 7, memory: 2 * 1024 * 1024}).show();
  await f.check();
  assert.deepEqual(f.discarded, []);
});
test('zero-period scans for startup and menu actions keep a page shown in a Zen split view', async () => {
  const f = fixture();
  f.addTab({active: true, groupId: 7});
  f.addTab({groupId: 7}).show();
  await f.manual();
  assert.deepEqual(f.discarded, []);
});
test('Zen split tabs become discardable when the split view is no longer shown', async () => {
  const f = fixture();
  const left = f.addTab({groupId: 7}); const right = f.addTab({groupId: 7});
  left.show(); right.show();
  f.addTab({active: true});
  left.hide(); right.hide();
  f.advance(2 * minute); await f.check();
  assert.deepEqual(f.discarded, [1, 2]);
});
test('disabling split view protection permits discarding a page shown in a Zen split view', async () => {
  const f = fixture({'split-view': false});
  f.addTab({active: true, groupId: 7});
  f.addTab({groupId: 7}).show();
  f.advance(2 * minute); await f.check();
  assert.deepEqual(f.discarded, [2]);
});
test('tabs of a native split view with a splitViewId stay protected', async () => {
  const f = fixture();
  f.addTab({active: true, splitViewId: 3});
  f.addTab({splitViewId: 3});
  f.advance(2 * minute); await f.check();
  assert.deepEqual(f.discarded, []);
});
