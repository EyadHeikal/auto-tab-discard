# Call and media inactivity regression tests

Run with Node.js 18 or newer:

```sh
node --test tests/*.test.cjs
```

The tests execute the real v3 content scripts and worker modules with controlled browser APIs and clocks. They cover:

- Firefox microphone, camera, and screen sharing during quiet periods.
- Live audio/video streams, muted elements, disabled tracks, embedded frames, and stream termination.
- WebRTC connection setup, receive-only and data-channel connections, reconnect grace, closure, and capture permission requests.
- Constructor compatibility, unchanged capture promises/errors, reinjection, and page lifecycle cleanup.
- Validated page-to-content-script state messages and a complete inactivity interval after a call ends.
- Automatic memory discards, calls started after candidate scans, queued jobs, and explicit manual discard behavior.
- Enabled YouTube plugin integration on meeting and video pages, including final protection checks and discard completion promises.
- Unavailable or malformed per-frame call metadata, while preserving explicit manual and unloaded-page discards.
- Existing media-stop, paused-player, unsaved-form, age ordering, and preference behavior.

`MediaStreamTrack.stop()` and `RTCPeerConnection.close()` deliberately emit no events in the fixtures; the tests require state refresh to detect them. The fixtures do not emulate native Firefox picture-in-picture, browser extension execution worlds, or a real Meet/Discord call. Those paths require browser verification after the extension and meeting pages are reloaded.

Run browser packaging regressions with Python's standard library:

```sh
python3 -B -m unittest discover -s tests -p test_build.py -v
```

These tests build real source files in a temporary directory and inspect both archives. They check Firefox's manifest compatibility and preserved call observer, plus Chrome's managed-storage schema.
