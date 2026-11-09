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

#### Zen: persistent local installation

Zen allows unsigned extensions to be installed permanently after changing a profile preference:

1. Run `python3 build.py` and find the generated `*-firefox-unsigned.xpi` under the new `dist/` directory.
2. In Zen's `about:config`, set `xpinstall.signatures.required` to `false`. This disables Mozilla signature enforcement for extensions throughout that Zen profile.
3. Open `about:addons` and enable any existing Auto Tab Discard copy first. Then click the gear menu, choose **Install Add-on From File**, and select that XPI. Use this installation method instead of **Load Temporary Add-on**.
4. Open Auto Tab Discard's details, ensure it is enabled, and set **Allow automatic updates** to **Off** so a store update cannot replace your modified build.

Installing the same version over a disabled copy only enables the old package. If that happened, install the XPI again while the add-on is enabled.

The package keeps the original extension ID. Install over the existing copy without uninstalling it first to retain its settings. Reload call pages before joining a meeting, then restart Zen to check that the extension stays enabled.

Zen installs a copy of the package, so later source edits require running `python3 build.py` again and installing the new XPI through the same menu. See [Zen's unsigned-extension support](https://github.com/zen-browser/desktop/commit/10cd70e858e03c5de54efa5343cb984ce3af450c) and [Mozilla's installation instructions](https://extensionworkshop.com/documentation/develop/test-permission-requests/).

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

### Versions, releases and installing

**The project is active.** New versions are published directly to the browser stores. This repository does not use GitHub *Releases*; every store version has a git tag instead, see [Tags](https://github.com/rNeomy/auto-tab-discard/tags). (Background: [#418](https://github.com/rNeomy/auto-tab-discard/issues/418), [#427](https://github.com/rNeomy/auto-tab-discard/issues/427).)

| What | Where |
|---|---|
| Current source | [`v3/`](v3) (Manifest V3; the version is in `v3/manifest.json`) |
| Earlier code | [`v2/`](v2) (Manifest V2, last version 0.5.0) |
| Version history | git tags `vX.Y.Z`, one per store release (older tags have no `v` prefix) |
| Release notes | [Firefox Add-ons version history](https://addons.mozilla.org/firefox/addon/auto-tab-discard/versions/) |
| Install | the store links above, or on Debian: `sudo apt install webext-auto-tab-discard` |

#### Why there are no downloadable builds here

Store builds are signed. Release and beta versions of Firefox only install add-ons that Mozilla has signed, and that signing happens through addons.mozilla.org ([Firefox Extension Workshop](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/): "Add-ons need to be signed before they can be installed into release and beta versions of Firefox"). A zip attached to a GitHub release could not be installed permanently in a normal Firefox, while the store copy is signed and updates itself. The Chrome, Edge and Opera stores likewise serve their own packages. So the stores are the release channel, and this repository holds the source with a tag for each released version.

#### Running from source

  * Firefox: open `about:debugging#/runtime/this-firefox`, click *Load Temporary Add-on* and select `v3/manifest.json` (it is removed when Firefox restarts).
  * Chrome / Edge: open `chrome://extensions`, enable *Developer mode*, click *Load unpacked* and select the `v3/` folder.
