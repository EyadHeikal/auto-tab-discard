{
  const top = window.top === window;
  if (typeof document.dispatchEvent === 'function') {
    document.dispatchEvent(new Event('auto-tab-discard:call-state-request'));
  }
  const callActive = window.isUsingCall === true || [...document.querySelectorAll('video,audio')].some(media => {
    try {
      return media.srcObject?.getTracks().some(track =>
        (track.kind === 'audio' || track.kind === 'video') && track.readyState === 'live');
    }
    catch (e) {
      return false;
    }
  });
  // https://github.com/rNeomy/auto-tab-discard/issues/315
  const paused = [...document.querySelectorAll('video,audio')].some(e => {
    return e.paused && e.currentTime;
  });

  (top ? {
    'time': window.lastVisit || performance.timing.domLoading,
    'mediaStop': window.lastMediaStop || 0,
    'callStop': window.lastCallStop || 0,
    callActive,
    'audible': Boolean(document.pictureInPictureElement),
    paused,
    'permission': typeof Notification !== 'undefined' ? Notification.permission === 'granted' : false,
    'ready': document.readyState === 'complete' || document.readyState === 'loaded',
    'memory': performance && performance.memory ? performance.memory.totalJSHeapSize : false,
    'forms': window.isReceivingFormInput || false
  } : {
    'mediaStop': window.lastMediaStop || 0,
    'callStop': window.lastCallStop || 0,
    callActive,
    'audible': Boolean(document.pictureInPictureElement),
    paused,
    'forms': window.isReceivingFormInput || false
  // eslint-disable-next-line semi
  })
}
