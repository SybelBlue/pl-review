# PrairieLearn Puppeteer Sidecar

## Chosen approach

This MVP uses a single long-lived Node.js process with a newline-delimited `stdin` command loop. That was the best fit for a terminal-first workflow because it is easy to run manually in a shell, keeps setup minimal, and gives an external CLI a simple integration point later by keeping the child process open and writing commands such as `sync-refresh\n` to its stdin.

I could not inspect your live PrairieLearn DOM from this environment, so the PrairieLearn-specific assumptions are isolated in [`src/prairielearn/selectors.js`](./src/prairielearn/selectors.js). The rest of the code treats PrairieLearn as an opaque web app and uses layered selector and text-based fallbacks.

## Recommended project structure

```text
.
├── bin/
│   └── pl-sidecar.js
├── src/
│   ├── browser/
│   │   └── session.js
│   ├── commands/
│   │   ├── command-dispatcher.js
│   │   └── command-loop.js
│   ├── lib/
│   │   ├── args.js
│   │   └── logger.js
│   ├── prairielearn/
│   │   ├── page-actions.js
│   │   └── selectors.js
│   └── index.js
├── .gitignore
├── package.json
└── README.md
```

## MVP implementation

The implementation is in the files above. The main entrypoint is [`bin/pl-sidecar.js`](./bin/pl-sidecar.js), which calls into [`src/index.js`](./src/index.js).

Key modules:

- [`src/browser/session.js`](./src/browser/session.js): browser launch/connect, page ownership, reloads, navigation, and shutdown behavior
- [`src/prairielearn/page-actions.js`](./src/prairielearn/page-actions.js): page readiness waits plus next/prev element discovery and click behavior
- [`src/prairielearn/selectors.js`](./src/prairielearn/selectors.js): the only place where PrairieLearn DOM assumptions live
- [`src/commands/command-dispatcher.js`](./src/commands/command-dispatcher.js): command parsing and action dispatch
- [`src/commands/command-loop.js`](./src/commands/command-loop.js): persistent stdin loop for terminal control and future CLI integration

## Setup instructions

1. Install dependencies:

```bash
npm install
```

2. If you want Puppeteer to launch its own browser window, that is enough in the common case.

3. If you prefer connecting to an already-running browser, start Chrome or Chromium with remote debugging enabled. For example:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222
```

Then obtain the browser WebSocket endpoint from `http://127.0.0.1:9222/json/version` and pass it with `--browser-ws-endpoint`.

4. Optional but recommended: add one or more PrairieLearn-specific ready selectors after your first run:

```bash
--ready-selector ".question-container"
--ready-selector "[data-question-id]"
```

## Run instructions

### Launch a dedicated controlled browser window

```bash
npm start -- --url http://localhost:3000
```

### Connect to an existing browser

```bash
npm start -- \
  --browser-ws-endpoint ws://127.0.0.1:9222/devtools/browser/<id> \
  --url http://localhost:3000
```

### Common commands once the sidecar is running

```text
help
status
current
next
prev
reload
hard-reload
reload-disk
index-questions
index-questions 2
index-assessment
goto http://localhost:3000/pl/course_instance/1/instructor/question/2/preview
sync-refresh
quit
```

### External CLI integration idea

For the MVP, keep the sidecar alive as a child process and write newline-delimited commands to its stdin. Example commands:

```text
sync-refresh
next
goto http://localhost:3000/...
```

That keeps the control path very small and easy to reason about.

## Design decisions and tradeoffs

- `stdin` command loop instead of HTTP for the MVP:
  Minimal setup, great for an interactive shell, and trivial if your existing CLI can own the child process.
- Puppeteer `launch` and `connect` both supported:
  Dedicated mode is simpler, while connect mode lets you reuse an already-running browser profile or session.
- `reload-disk` follows the link `href` instead of clicking the button:
  That is closer to how the page already models the action and avoids relying on click handlers when a normal GET endpoint exists.
- PrairieLearn treated as an opaque app:
  No container changes, no internal API assumptions, and no dependence on PrairieLearn server-side hooks.
- Selector isolation:
  DOM assumptions live in one file so maintenance stays cheap when PrairieLearn markup changes.
- Explicit waits:
  The code waits for document readiness, common busy indicators, optional ready selectors, and then attempts a short network-idle check when possible.
- `hard-reload` uses Chrome DevTools Protocol:
  That is more intentional than a plain reload plus arbitrary delay, though it is still browser-level rather than PrairieLearn-specific.

## How to adapt this to PrairieLearn DOM changes

1. Edit [`src/prairielearn/selectors.js`](./src/prairielearn/selectors.js).
2. Update `navigation.next.selectors` and `navigation.prev.selectors` with the most stable selectors you can find from DevTools.
3. If the buttons have reliable text but unstable classes, update the `textPatterns` arrays instead.
4. Add a PrairieLearn-specific element to `ready` that is present when the target page is usable.
5. Add or remove `busy` selectors to match any loading overlays or spinners you see locally.
6. If your next/prev flow stops being click-based, adapt [`src/prairielearn/page-actions.js`](./src/prairielearn/page-actions.js) to follow links directly or trigger a keyboard shortcut as a fallback.

The intended workflow is: first run it, see which control was not found, inspect the DOM once, then adjust the selector list in one place.

## Next improvements

- Add a lightweight local HTTP or Unix socket control endpoint for unrelated processes that do not own the sidecar stdin.
- Add a `watch` mode that listens for filesystem change events and automatically issues `sync-refresh`.
- Add optional URL pattern assertions so the sidecar can verify it is still on a PrairieLearn page before running `next` or `prev`.
- Add a `discover` or `debug-selectors` command that prints candidate buttons and link labels from the current page to speed up first-run tuning.
- Add support for saving and restoring named URLs for common PrairieLearn review routes.
