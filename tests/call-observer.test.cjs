const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = () => fs.readFileSync(path.join(__dirname, '../v3/data/inject/calls.js'), 'utf8');
const request = 'auto-tab-discard:call-state-request';
const response = 'auto-tab-discard:call-state';
const epoch = 1700000000000;

function fixture() {
  let now = epoch;
  let nextTimer = 0;
  const timers = new Map();
  class Event {
    constructor(type, options = {}) {
      Object.assign(this, {type}, options);
    }
  }
  class Target {
    constructor() {
      this.listeners = new Map();
    }
    addEventListener(type, fn, options) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Map());
      this.listeners.get(type).set(fn, options);
    }
    removeEventListener(type, fn) {
      this.listeners.get(type)?.delete(fn);
    }
    dispatchEvent(event) {
      event.target = this;
      for (const [fn, options] of [...(this.listeners.get(event.type) || [])]) {
        if (options?.once) this.removeEventListener(event.type, fn);
        fn.call(this, event);
      }
      return true;
    }
    get listenerCount() {
      return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0);
    }
  }
  class Track extends Target {
    constructor(kind = 'audio', options = {}) {
      super();
      Object.assign(this, {kind, readyState: 'live', enabled: false, muted: true}, options);
    }
    stop() {
      this.readyState = 'ended';
    }
    end() {
      this.stop();
      this.dispatchEvent(new Event('ended'));
    }
  }
  class Stream extends Target {
    constructor(tracks = []) {
      super();
      this.tracks = tracks;
    }
    getTracks() {
      return [...this.tracks];
    }
    getAudioTracks() {
      return this.getTracks().filter(track => track.kind === 'audio');
    }
    getVideoTracks() {
      return this.getTracks().filter(track => track.kind === 'video');
    }
    get active() {
      return this.tracks.some(track => track.readyState === 'live');
    }
  }
  class Peer extends Target {
    constructor(...args) {
      super();
      this.args = args;
      this.connectionState = 'new';
      this.iceConnectionState = 'new';
      this.signalingState = 'stable';
      this.receivers = [];
      this.senders = [];
    }
    static generateCertificate(options) {
      return Promise.resolve(options);
    }
    getReceivers() {
      return this.receivers;
    }
    getSenders() {
      return this.senders;
    }
    createDataChannel(label) {
      return {label, readyState: 'open'};
    }
    setState(state) {
      this.connectionState = state;
      this.iceConnectionState = state === 'connecting' ? 'checking' : state;
      this.dispatchEvent(new Event('connectionstatechange'));
      this.dispatchEvent(new Event('iceconnectionstatechange'));
    }
    close() {
      this.connectionState = 'closed';
      this.iceConnectionState = 'closed';
      this.signalingState = 'closed';
    }
    receive(track) {
      this.receivers.push({track});
      this.dispatchEvent(new Event('track', {track, streams: [new Stream([track])]}));
    }
  }
  const document = new Target();
  document.querySelectorAll = () => [];
  const window = new Target();
  const userMedia = [];
  const displayMedia = [];
  const devices = {
    getUserMedia(...args) {
      assert.equal(this, devices);
      return userMedia.shift().result;
    },
    getDisplayMedia(...args) {
      assert.equal(this, devices);
      return displayMedia.shift().result;
    }
  };
  const setTimer = (fn, delay = 0, repeat = false) => {
    const id = ++nextTimer;
    timers.set(id, {fn, at: now + delay, repeat, delay});
    return id;
  };
  const sandbox = {console, document, CustomEvent: Event, Event, EventTarget: Target,
    RTCPeerConnection: Peer, webkitRTCPeerConnection: Peer, MediaStream: Stream, MediaStreamTrack: Track,
    navigator: {mediaDevices: devices}, performance: {now: () => now - epoch},
    Date: class extends Date {static now() {return now;}},
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
    dispatchEvent: window.dispatchEvent.bind(window),
    setTimeout: (fn, delay) => setTimer(fn, delay), clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => setTimer(fn, delay, true), clearInterval: id => timers.delete(id),
    queueMicrotask};
  const ctx = vm.createContext(sandbox);
  vm.runInContext('this.window = this; this.top = this;', ctx);
  vm.runInContext(source(), ctx);
  return {ctx, Peer, Track, Stream, document, window, timers,
    peer: (...args) => new ctx.RTCPeerConnection(...args),
    track: (kind, options) => new Track(kind, options),
    state: () => {
      let state;
      const listener = event => {state = JSON.parse(event.detail);};
      document.addEventListener(response, listener);
      document.dispatchEvent(new Event(request));
      document.removeEventListener(response, listener);
      assert.equal(typeof state?.active, 'boolean', 'observer answers a synchronous state request');
      assert.equal(typeof state?.stopped, 'number');
      return state;
    },
    capture: (result, display = false) => {
      (display ? displayMedia : userMedia).push({result});
      return devices[display ? 'getDisplayMedia' : 'getUserMedia']({audio: true, video: true});
    },
    lifecycle: (type, persisted = false) => window.dispatchEvent(new Event(type, {persisted})),
    reinstall: () => vm.runInContext(source(), ctx),
    advance: duration => {
      const end = now + duration;
      let iterations = 0;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        assert.ok(++iterations < 10000, 'timers must settle');
        const [id, timer] = next;
        now = timer.at;
        timers.delete(id);
        if (timer.repeat) timers.set(id, {...timer, at: now + timer.delay});
        timer.fn();
      }
      now = end;
    }
  };
}

test('unused peers and ordinary pages do not acquire call protection', () => {
  const f = fixture();
  assert.equal(f.state().active, false);
  f.peer();
  f.advance(10 * 60000);
  assert.equal(f.state().active, false);
  assert.equal(f.timers.size, 0);
});
test('connected data-channel peers protect a silent tab with no media devices enabled', () => {
  const f = fixture(); const peer = f.peer(); peer.createDataChannel('call'); peer.setState('connected');
  assert.equal(f.state().active, true);
  f.advance(24 * 60 * 60000);
  assert.equal(f.state().active, true);
});
test('receive-only calls and disabled muted tracks remain active', () => {
  const f = fixture(); const peer = f.peer(); peer.receive(f.track('audio')); peer.setState('connected');
  assert.equal(peer.getSenders().length, 0);
  assert.equal(f.state().active, true);
});
test('connecting peers protect a call before media starts', () => {
  const f = fixture(); const peer = f.peer(); peer.setState('connecting');
  assert.equal(f.state().active, true);
  f.advance(60001);
  assert.equal(f.state().active, false);
});
test('disconnected and failed peer protection expires without requests renewing it', () => {
  for (const state of ['disconnected', 'failed']) {
    const f = fixture(); const peer = f.peer(); peer.setState('connected'); f.advance(1000); peer.setState(state);
    assert.equal(f.state().active, true, state);
    f.advance(59000); assert.equal(f.state().active, true, state);
    f.advance(1001); assert.equal(f.state().active, false, state);
    const stopped = f.state().stopped;
    assert.ok(stopped >= epoch);
    f.advance(10000); assert.equal(f.state().stopped, stopped, state);
    assert.equal(f.timers.size, 0);
  }
});
test('reconnecting before grace expires preserves the call', () => {
  const f = fixture(); const peer = f.peer(); peer.setState('connected'); peer.setState('disconnected');
  f.advance(59000); peer.setState('connected'); f.advance(2 * 60000);
  assert.equal(f.state().active, true);
});
test('closing the last peer releases protection without a statechange event', () => {
  const f = fixture(); const peer = f.peer(); peer.setState('connected');
  assert.equal(f.state().active, true);
  f.advance(1000); peer.close(); assert.equal(f.state().active, false);
  const stopped = f.state().stopped;
  assert.equal(stopped, epoch + 1000);
  f.advance(2 * 60000); assert.equal(f.state().active, false);
  assert.equal(f.state().stopped, stopped);
  assert.equal(f.timers.size, 0);
  assert.equal(peer.listenerCount, 0);
});
test('closing one of multiple peers keeps the other call protected', () => {
  const f = fixture(); const first = f.peer(); const second = f.peer();
  first.setState('connected'); second.setState('connected'); first.close();
  assert.equal(f.state().active, true);
  second.close(); assert.equal(f.state().active, false);
});
test('native peer constructor arguments, subclassing, and statics are preserved', async () => {
  const f = fixture(); const configuration = {iceServers: []};
  class Derived extends f.ctx.RTCPeerConnection {}
  const peer = new Derived(configuration);
  assert.ok(peer instanceof Derived);
  assert.ok(peer instanceof f.Peer);
  assert.equal(peer.args[0], configuration);
  assert.equal(await f.ctx.RTCPeerConnection.generateCertificate(configuration), configuration);
  peer.setState('connected'); assert.equal(f.state().active, true);
});
test('reinjection does not wrap peers twice or duplicate listeners', () => {
  const f = fixture(); const constructor = f.ctx.RTCPeerConnection; f.reinstall();
  assert.equal(f.ctx.RTCPeerConnection, constructor);
  const peer = f.peer(); peer.setState('connected'); peer.close();
  assert.equal(f.state().active, false);
  assert.equal(peer.listenerCount, 0);
  assert.equal(f.timers.size, 0);
});
test('pending and successful capture stay protected until track.stop without an ended event', async () => {
  const f = fixture(); const track = f.track(); const stream = new f.Stream([track]);
  let resolve;
  const pending = new Promise(done => {resolve = done;});
  const capture = f.capture(pending);
  assert.equal(capture, pending);
  assert.equal(f.state().active, true);
  resolve(stream); assert.equal(await capture, stream); await Promise.resolve();
  assert.equal(f.state().active, true);
  f.advance(1000); track.stop(); assert.equal(f.state().active, false);
  assert.equal(f.state().stopped, epoch + 1000);
  assert.equal(track.listenerCount, 0);
});
test('unresolved capture requests expire without renewed protection on state requests', () => {
  const f = fixture(); f.capture(new Promise(() => {}));
  assert.equal(f.state().active, true);
  f.advance(59000); assert.equal(f.state().active, true);
  f.advance(1001); assert.equal(f.state().active, false);
  assert.equal(f.timers.size, 0);
});
test('rejected capture preserves its error and leaves no protection or timers', async () => {
  const f = fixture(); const error = new Error('permission denied'); const pending = Promise.reject(error);
  const capture = f.capture(pending);
  assert.equal(capture, pending);
  await assert.rejects(capture, value => value === error); await Promise.resolve();
  assert.equal(f.state().active, false);
  assert.equal(f.timers.size, 0);
});
test('display capture remains protected until its last live track ends', async () => {
  const f = fixture(); const audio = f.track(); const video = f.track('video');
  const stream = new f.Stream([audio, video]); const pending = Promise.resolve(stream);
  assert.equal(f.capture(pending, true), pending); await pending; await Promise.resolve();
  assert.equal(f.state().active, true);
  audio.end(); assert.equal(f.state().active, true);
  video.end(); assert.equal(f.state().active, false);
  assert.equal(audio.listenerCount + video.listenerCount, 0);
});
test('a resolved capture with no live tracks cannot protect an idle page', async () => {
  const f = fixture(); const track = f.track(); track.stop();
  await f.capture(Promise.resolve(new f.Stream([track]))); await Promise.resolve();
  assert.equal(f.state().active, false);
});
test('pagehide drops peer and track listeners and outstanding grace timers', async () => {
  const f = fixture(); const peer = f.peer(); const track = f.track();
  peer.setState('connected'); await f.capture(Promise.resolve(new f.Stream([track]))); await Promise.resolve();
  peer.setState('disconnected'); f.lifecycle('pagehide');
  assert.equal(peer.listenerCount, 0);
  assert.equal(track.listenerCount, 0);
  assert.equal(f.timers.size, 0);
});
test('a page restored from back-forward cache retains its call protection', () => {
  const f = fixture(); const peer = f.peer(); peer.setState('connected');
  f.lifecycle('pagehide', true); f.advance(60000); f.lifecycle('pageshow', true);
  assert.equal(f.state().active, true);
  peer.close(); assert.equal(f.state().active, false);
});
