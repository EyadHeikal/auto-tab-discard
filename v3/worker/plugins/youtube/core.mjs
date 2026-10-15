import {log} from '../../core/utils.mjs';
import {discard} from '../../core/discard.mjs';

const perform = discard.perform;

function enable() {
  log('installing youtube/core.js');
  discard.perform = (tab, options = {}) => {
    if (tab.url && tab.url.startsWith('https://www.youtube.com/')) {
      return chrome.scripting.executeScript({
        target: {
          tabId: tab.id
        },
        world: 'MAIN',
        func: () => {
          const player = document.querySelector('.html5-video-player');
          if (player) {
            const t = player.getCurrentTime();
            if (t) {
              const s = new URLSearchParams(location.search);
              s.set('t', t + 's');
              history.replaceState(history.state, '', '?' + s.toString());
            }
          }
        }
      }).catch(e => {
        console.error('plugins/youtube -> error', e);
      }).then(() => perform(tab, options));
    }
    else {
      return perform(tab, options);
    }
  };
}
function disable() {
  log('removing youtube/core.js');
  discard.perform = perform;
}

export default {
  enable,
  disable
};
