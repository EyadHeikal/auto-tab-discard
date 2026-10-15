(() => {
  const key = '__autoTabDiscardCalls';
  if (window[key]) {
    return;
  }
  window[key] = true;

  const grace = 60 * 1000;
  const peers = new Set();
  const tracks = new Set();
  const pending = new Set();
  const seenTracks = new WeakSet();
  const restore = [];
  let active = false;
  let stopped = 0;
  let disposed = false;
  let refreshing = false;

  const remove = (entries, entry, target) => {
    for (const name of entry.events) {
      target?.removeEventListener(name, entry.update);
    }
    entries.delete(entry);
  };
  const phase = peer => {
    const states = [peer.connectionState, peer.iceConnectionState];
    if (states.includes('closed') || peer.signalingState === 'closed') {
      return 'closed';
    }
    if (states.includes('failed') || states.includes('disconnected')) {
      return 'reconnecting';
    }
    if (states.includes('connected') || states.includes('completed')) {
      return 'connected';
    }
    return 'connecting';
  };
  const refresh = () => {
    if (disposed || refreshing) {
      return;
    }
    refreshing = true;
    try {
      const now = Date.now();
      let next = false;
      for (const entry of peers) {
        const peer = entry.ref.deref();
        if (!peer || phase(peer) === 'closed') {
          remove(peers, entry, peer);
          continue;
        }
        const state = phase(peer);
        if (state !== entry.state) {
          entry.state = state;
          entry.since = now;
        }
        next = next || state === 'connected' || now - entry.since < grace;
      }
      for (const entry of tracks) {
        const track = entry.ref.deref();
        if (!track || track.readyState !== 'live') {
          remove(tracks, entry, track);
          continue;
        }
        next = true;
      }
      for (const request of pending) {
        if (now >= request.until) {
          pending.delete(request);
        }
        else {
          next = true;
        }
      }
      if (active && !next) {
        stopped = now;
      }
      active = next;
      document.dispatchEvent(new CustomEvent('auto-tab-discard:call-state', {
        detail: JSON.stringify({active, stopped})
      }));
    }
    catch (e) {}
    finally {
      refreshing = false;
    }
  };
  const rememberTrack = track => {
    if (!track || seenTracks.has(track) || track.readyState !== 'live' ||
        (track.kind !== 'audio' && track.kind !== 'video')) {
      return;
    }
    seenTracks.add(track);
    const entry = {ref: new WeakRef(track), events: ['ended'], update: refresh};
    tracks.add(entry);
    track.addEventListener('ended', entry.update);
  };
  const rememberPeer = peer => {
    const entry = {
      ref: new WeakRef(peer),
      state: phase(peer),
      since: Date.now(),
      events: ['connectionstatechange', 'iceconnectionstatechange'],
      update: refresh
    };
    peers.add(entry);
    for (const name of entry.events) {
      peer.addEventListener(name, entry.update);
    }
    refresh();
  };
  const replace = (target, name, value) => {
    const original = target[name];
    try {
      target[name] = value;
      if (target[name] === value) {
        restore.push(() => {
          if (target[name] === value) {
            target[name] = original;
          }
        });
      }
    }
    catch (e) {}
  };
  const constructors = new Map();
  for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection']) {
    const original = window[name];
    if (typeof original !== 'function') {
      continue;
    }
    let wrapped = constructors.get(original);
    if (!wrapped) {
      wrapped = new Proxy(original, {
        construct(target, args, receiver) {
          const peer = Reflect.construct(target, args, receiver);
          try {
            rememberPeer(peer);
          }
          catch (e) {}
          return peer;
        }
      });
      constructors.set(original, wrapped);
      const close = original.prototype.close;
      if (typeof close === 'function') {
        replace(original.prototype, 'close', new Proxy(close, {
          apply(target, receiver, args) {
            const result = Reflect.apply(target, receiver, args);
            refresh();
            return result;
          }
        }));
      }
    }
    replace(window, name, wrapped);
  }

  const devices = navigator.mediaDevices;
  if (devices) {
    for (const name of ['getUserMedia', 'getDisplayMedia']) {
      const original = devices[name];
      if (typeof original !== 'function') {
        continue;
      }
      replace(devices, name, new Proxy(original, {
        apply(target, receiver, args) {
          const result = Reflect.apply(target, receiver, args);
          const request = {until: Date.now() + grace};
          pending.add(request);
          refresh();
          result.then(stream => {
            pending.delete(request);
            if (!disposed) {
              try {
                stream.getTracks().forEach(rememberTrack);
              }
              catch (e) {}
              refresh();
            }
          }, () => {
            pending.delete(request);
            refresh();
          }).catch(() => {});
          return result;
        }
      }));
    }
  }

  const hide = event => {
    if (event.persisted) {
      return;
    }
    for (const entries of [peers, tracks]) {
      for (const entry of entries) {
        remove(entries, entry, entry.ref.deref());
      }
    }
    pending.clear();
    refresh();
    disposed = true;
    document.removeEventListener('auto-tab-discard:call-state-request', refresh);
    removeEventListener('pagehide', hide);
    removeEventListener('pageshow', refresh);
    restore.reverse().forEach(revert => revert());
    delete window[key];
  };
  document.addEventListener('auto-tab-discard:call-state-request', refresh);
  addEventListener('pagehide', hide);
  addEventListener('pageshow', refresh);
  refresh();
})();
