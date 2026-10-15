import {log} from './utils.mjs';

const isSharing = tab => {
  const state = tab.sharingState;
  return Boolean(state && (state.microphone === true || state.camera === true ||
    (typeof state.screen === 'string' && state.screen.length > 0)));
};

const isCallActive = (tab, metadata = []) => isSharing(tab) ||
  metadata.some(frame => frame && frame.callActive === true);

const protection = async (tab, audio = true) => {
  let current;
  try {
    current = await chrome.tabs.get(tab.id);
  }
  catch (e) {
    return true;
  }
  if (current.active || current.discarded) {
    log('automatic discarding aborted', 'tab is active or already discarded', current.id);
    return true;
  }
  if (!audio) {
    return false;
  }
  if (isSharing(current)) {
    log('automatic discarding aborted', 'active call or capture', current.id);
    return true;
  }
  if (current.status === 'unloaded') {
    return false;
  }
  const metadata = await chrome.scripting.executeScript({
    target: {tabId: current.id, allFrames: true},
    files: ['/data/inject/meta.js']
  }).then(results => results.map(result => result?.result), () => null);
  if (!metadata || metadata.length === 0 || metadata.some(frame =>
    !frame || typeof frame.callActive !== 'boolean')) {
    log('automatic discarding aborted', 'cannot verify call or capture state', current.id);
    return true;
  }
  try {
    current = await chrome.tabs.get(current.id);
  }
  catch (e) {
    return true;
  }
  if (current.active || current.discarded) {
    log('automatic discarding aborted', 'tab is active or already discarded', current.id);
    return true;
  }
  const protectedCall = isCallActive(current, metadata);
  if (protectedCall) {
    log('automatic discarding aborted', 'active call or capture', current.id);
  }
  return protectedCall;
};

export {isSharing, isCallActive, protection};
