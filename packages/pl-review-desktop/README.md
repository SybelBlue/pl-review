# pl-review-desktop

`pl-review-desktop` is the Electron package for reviewing a PrairieLearn assessment beside a PDF. The package is organized so the Electron bootstrap, desktop command-line/runtime logic, and renderer UI/state can be tested independently.

## Architecture

- `src/main.js`: Electron bootstrap, window creation, and IPC registration only
- `src/main/`
  - `config-store.cjs`: settings normalization and persistence
  - `command-line-service.cjs`: Docker/Git/GitHub CLI checks, Docker Desktop state, and running-container discovery
  - `prairielearn-runtime.cjs`: start/restart/reconnect/stop orchestration and streamed output handling
  - `webview-attach.cjs`: guest `webContents` validation and remote-debugging attachment
- `src/renderer/app.mjs`: renderer entrypoint
- `src/renderer/state/`: session, question, and config form logic
- `src/renderer/services/`: command building, PrairieLearn URL helpers, and Docker log formatting
- `src/renderer/ui/`: DOM rendering helpers for config, questions, PDF, and PrairieLearn status
- `src/renderer/controller/`: initialization and event binding

## Tests

Run the full desktop suite:

```bash
npm run test --workspace pl-review-desktop
```

Run the suites separately:

```bash
npm run test:main --workspace pl-review-desktop
npm run test:renderer --workspace pl-review-desktop
```

Test layout:

- `test/main/`: main-process service tests
- `test/renderer/`: renderer logic and DOM tests
- `test/fixtures/renderer-shell.html`: shared DOM fixture for renderer tests

The renderer tests use Node's built-in runner with `jsdom`.

## Desktop Command-Line Prerequisites

- `docker` is required
- `git` is required
- `gh` is optional
  - missing `gh` shows a warning
  - unauthenticated `gh` also shows a warning

Connection modes:

- `structured`: builds the Docker command from mounted course directories and a `/jobs` directory
- `custom`: runs the exact command entered in the custom editor
- `reconnect`: waits for an already running PrairieLearn container to be reachable at the configured base URL
