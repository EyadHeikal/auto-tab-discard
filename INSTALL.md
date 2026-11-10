# Install a local build

This guide tells how to build Auto Tab Discard from this repository and how to install the build in a browser. A local build contains the source code of this repository. This code can have changes that the store versions do not have, for example the [protection of active calls](README.md#active-calls).

Use the method for your browser:

| Browser | Method | After a browser restart |
|---|---|---|
| Zen, Firefox Developer Edition, Firefox Nightly, Firefox ESR | [Permanent installation](#permanent-installation) | The add-on stays installed. |
| Firefox Release, Firefox Beta | [Temporary installation](#temporary-installation) | The browser removes the add-on. |
| Chrome, Edge, Brave, Vivaldi, Opera, and other Chromium-based browsers | [Load unpacked](#chromium-based-browsers-chrome-edge-brave-vivaldi-opera) | The extension stays installed. |

For other Firefox-based browsers, see [Firefox and Firefox-based browsers](#firefox-and-firefox-based-browsers-zen).

## Requirements

- Python 3 for the build script. The script uses only the Python standard library.
- A Firefox-based browser on Firefox 148 or later. This value is `strict_min_version` in `v3/manifest.json`.
- A Chromium-based browser on Chromium 111 or later. This value is `minimum_chrome_version` in `v3/manifest.json`.

## Build

Run this command in the root folder of the repository:

```sh
python3 build.py
```

Each run makes a new folder in `dist/`, for example `dist/auto-tab-discard-0.7.7-call-protection-gvfanony/`. Older builds stay in `dist/`. At the end, the script prints the paths of the new folders and packages.

| Path in the new folder | Use |
|---|---|
| `chrome/` | The unpacked extension for Chromium-based browsers |
| `firefox/` | The unpacked extension for Firefox-based browsers |
| `auto-tab-discard-<version>-call-protection-chrome.zip` | The files of `chrome/` in one archive |
| `auto-tab-discard-<version>-call-protection-firefox-unsigned.xpi` | The XPI (Firefox extension package) for Firefox-based browsers. Mozilla did not sign it. |
| `SHA256SUMS` | The SHA-256 checksums of the ZIP file and the XPI file |

To check the two packages, run `shasum -a 256 -c SHA256SUMS` in the new folder. On Linux, `sha256sum -c SHA256SUMS` also works.

The build uses the version number in `v3/manifest.json` without a change, for example `0.7.7`. Thus a local build and the store release of the same version show the same version number.

## Firefox and Firefox-based browsers (Zen)

Firefox keeps an add-on after a restart only if Mozilla signed the add-on, or if the browser lets you turn off the signature check. The XPI of a local build is not signed, and this repository does not send it to Mozilla for signing.

- [Zen](https://github.com/zen-browser/desktop/commit/10cd70e858e03c5de54efa5343cb984ce3af450c) lets you turn off the signature check.
- Firefox Developer Edition, Firefox Nightly, Firefox ESR, and the unbranded builds of Firefox Release and Beta also let you turn off the check.
- Firefox Release and Firefox Beta do not let you turn off the check.

Source: [Mozilla wiki: Extension Signing](https://wiki.mozilla.org/Add-ons/Extension_Signing).

Other Firefox-based browsers can have either behavior. Try the permanent installation first. If the browser refuses the XPI because it is not signed, use the temporary installation.

### Permanent installation

> [!CAUTION]
> Step 2 turns off the signature check for all add-ons in this browser profile, not only for Auto Tab Discard. Install only add-ons that you trust.

1. [Build](#build) the extension. The `*-firefox-unsigned.xpi` file is in the new folder in `dist/`.
2. Open `about:config`. Set `xpinstall.signatures.required` to `false`.
3. Open `about:addons`. If Auto Tab Discard is already installed, make sure that it is enabled.
4. Click the gear button. Click **Install Add-on From File**. Select the XPI file. Click **Add**.
5. Open the details of Auto Tab Discard. Set **Allow automatic updates** to **Off**. Then a store update cannot replace the local build.
6. Reload your meeting and voice-chat pages before you join a call. See [Active calls](README.md#active-calls).

The XPI keeps the extension ID of the store release, `{c2c003ee-bd69-42a2-b0e9-6f34222cb046}`. Thus the local build replaces the store copy and keeps its settings. Do not remove the store copy before the installation, because the removal deletes the settings.

If you install the XPI over a disabled copy with the same version, the browser only enables the old package. In this case, install the XPI again while the add-on is enabled.

The browser keeps its own copy of the XPI. After you change the source code, build again. Then do steps 3 and 4 with the new XPI.

In `about:addons`, the browser can show a message that it could not verify the add-on. This message is normal for an unsigned build.

More information: [Mozilla's installation instructions](https://extensionworkshop.com/documentation/develop/test-permission-requests/).

### Temporary installation

This method also works in Firefox Release and Firefox Beta.

1. [Build](#build) the extension.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on**.
4. Select the `*-firefox-unsigned.xpi` file, or the `manifest.json` file in the `firefox/` folder of the new build.
5. Reload your meeting and voice-chat pages before you join a call.

The add-on stays installed until you remove it or restart the browser. After a new build, remove the temporary add-on. Then load the new build.

Source: [Temporary installation in Firefox](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).

## Chromium-based browsers (Chrome, Edge, Brave, Vivaldi, Opera)

These browsers run a local build as an unpacked extension (an extension that the browser loads from a folder). If the manifest has no `key`, Chromium makes the extension ID from the path of the folder ([source](https://github.com/chromium/chromium/blob/main/extensions/common/extension.cc)). This has three results:

- The local build has a different ID than the store copy. Thus the two copies do not share settings.
- Each build is in a new folder in `dist/`. If you load each build from its own folder, the browser sees a new extension each time. To keep one ID, copy each build into the same fixed folder.
- The browser loads the files from the fixed folder at each start. Do not move or delete this folder.

### Copy a build into a fixed folder

Use a folder that contains only this extension, for example `~/Extensions/auto-tab-discard`.

> [!CAUTION]
> The `rsync --delete` command below deletes the files in `~/Extensions/auto-tab-discard` that are not in the new build. Do not use a folder that contains other files.

On macOS and Linux, run these commands in the root folder of the repository. They build the extension and copy the new `chrome/` folder into the fixed folder:

```sh
chrome_dir="$(python3 build.py | sed -n 's/^chrome: //p')"
mkdir -p ~/Extensions/auto-tab-discard
rsync -a --delete "${chrome_dir:?the build failed}/" ~/Extensions/auto-tab-discard/
```

If the build fails, the last command stops and copies nothing. On Windows, build the extension. Then copy the contents of the new `chrome/` folder with File Explorer.

### Install in a Chromium-based browser

1. Optional: to move your settings, open the options page of the store copy (**Details** > **Extension options**). Click **Export Settings**.
2. [Copy a build into the fixed folder](#copy-a-build-into-a-fixed-folder).
3. Open the extensions page of the browser:

   | Browser | Address |
   |---|---|
   | Chrome | `chrome://extensions` |
   | Edge | `edge://extensions` |
   | Brave | `brave://extensions` |
   | Vivaldi | `vivaldi://extensions` |
   | Opera | `opera://extensions` |

4. Turn on **Developer mode**.
5. If the store copy is installed, turn it off with the switch on its card. If both copies are on, both discard tabs, each with its own settings.
6. Click **Load unpacked**. Select the fixed folder, for example `~/Extensions/auto-tab-discard`.
7. Optional: open the options page of the local copy. Click **Import Settings**. Select the file from step 1. The import replaces all settings of the local copy and reloads the extension.
8. Reload your meeting and voice-chat pages before you join a call. Chrome's Memory Saver has a separate list of exceptions. See [Active calls](README.md#active-calls).

### Update in a Chromium-based browser

1. [Copy the new build into the fixed folder](#copy-a-build-into-a-fixed-folder).
2. On the extensions page, click the reload button on the card of the local copy.

The extension keeps its ID and its settings, because the path of the folder does not change.

The ZIP file has the same files as the `chrome/` folder. To use it on another computer, extract it. Then load the extracted folder.

## Go back to the store version

In a Chromium-based browser, remove the local copy on the extensions page. Then turn on the store copy again.

In a Firefox-based browser:

1. Open the options page of Auto Tab Discard (`about:addons` > **…** > **Options**). Click **Export Settings**.
2. In `about:addons`, remove Auto Tab Discard.
3. Install Auto Tab Discard from [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/auto-tab-discard/).
4. Open the options page. Click **Import Settings**. Select the file from step 1.
5. If no other add-on needs the setting, set `xpinstall.signatures.required` back to `true`.

## Load the source folder without a build

To load the `v3/` source folder directly, see [Running from source](README.md#running-from-source).
