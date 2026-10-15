# Auto Tab Discard
A browser extension which uses the native tab discarding method (`chrome.tabs.discard`) to automatically reduce memory usage of inactive tabs. This extension is more efficient and should be less buggy compared to the alternatives extensions that use DOM replacement method.

### Active calls

With media protection enabled, automatic discarding keeps tabs with active calls, live media streams, or microphone, camera, and screen capture loaded, even during silence. Firefox's native capture state provides an additional safeguard. Active calls also take priority over automatic memory limits. Explicit forced discard commands remain available.

After installing or reloading the modified extension, reload meeting and voice-chat pages before joining a call. Connections created before the extension started may not be detectable. The current implementation is shared by Chrome and Firefox under `v3/`.

For additional protection:

- Add `meet.google.com` and `discord.com` to Exceptions in each browser profile, keeping existing entries. These exceptions also keep the sites loaded outside calls.
- Enable the pinned-tab protection option if pinned tabs should stay loaded.
- Use an inactivity interval of at least ten minutes; ten minutes is already the default.
- In Chrome's Performance settings, add the same sites to "Always keep these sites active". Chrome's native Memory Saver has its own exception list, separate from the extension.

### Local builds

Run `python3 build.py` with Python 3. It creates a fresh directory under `dist/` with Chrome ZIP and unsigned Firefox XPI packages, matching unpacked folders, and SHA-256 checksums. Existing builds are preserved; version `0.7.7` is unchanged.

In Chrome, disable the store-installed copy, then use **Load unpacked** in `chrome://extensions` developer mode and select the generated `chrome/` folder. The local build has its own extension ID and settings; leave only one copy enabled.

For Firefox, use **Load Temporary Add-on** in `about:debugging#/runtime/this-firefox` and select the generated unsigned XPI. Temporary installation lasts until Firefox restarts. Permanent installation in standard Firefox requires Mozilla signing; this build does not sign or submit the add-on. Reload call pages before joining a meeting.

### Preview

[![IMAGE ALT TEXT HERE](https://img.youtube.com/vi/S0rHU38OnTE/0.jpg)](https://www.youtube.com/watch?v=S0rHU38OnTE)

### Links

  * Homepage: https://webextension.org/listing/tab-discard.html
  * Privacy Policy: https://webextension.org/privacy-policy/extension/tab-discard.html
  * Chrome: https://chrome.google.com/webstore/detail/auto-tab-discard/jhnleheckmknfcgijgkadoemagpecfol
  * Edge: https://microsoftedge.microsoft.com/addons/detail/auto-tab-discard/nfkkljlcjnkngcmdpcammanncbhkndfe
  * Firefox: https://addons.mozilla.org/firefox/addon/auto-tab-discard/
  * Opera: https://addons.opera.com/en/extensions/details/auto-tab-discard/
  * Product Review: https://webextension.org/blog/2022/04/17/auto-tab-discard-extension.html
  * Preview: https://www.youtube.com/watch?v=S0rHU38OnTE
