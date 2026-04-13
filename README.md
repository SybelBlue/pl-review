# PrairieLearn Review Desktop

PrairieLearn Review Desktop is a local Electron app for reviewing a PDF assessment next to a PrairieLearn instance running in Docker. The app lets you:

- choose a PDF on launch
- start a locally configured PrairieLearn container
- view the PDF and PrairieLearn side by side
- move between locally defined question records
- sync each question to a PrairieLearn URL and a PDF page
- flag questions, add notes, and resume later from local storage

## Workspace Layout

This repo now uses npm workspaces. The Electron app lives at `packages/pl-review-desktop`, while the repo root acts as the workspace manager for this package and any future sibling packages.

## Requirements

- Node.js 20+
- Docker Desktop or another local Docker runtime

## Install

```bash
npm install
```

Run this from the repo root. npm will install dependencies for all workspace packages.

## Run

```bash
npm start
```

This root command forwards to the `pl-review-desktop` workspace package.

## Dev Mode

```bash
npm run dev
```

In dev mode, saving files under `packages/pl-review-desktop/src/renderer/` reloads the window, while saving `packages/pl-review-desktop/src/main.js` or `packages/pl-review-desktop/src/preload.js` relaunches Electron.

If you want to target the package directly, you can also run commands like:

```bash
npm run dev --workspace pl-review-desktop
```

## First Launch

1. Click `Choose PDF` or drag a PDF into the window.
2. Open the `PrairieLearn Connection` panel.
3. Set `Base URL` to the PrairieLearn URL you expect locally, such as `http://127.0.0.1:3000`.
4. Leave the connection mode on `Structured` and choose the local course directory to mount as `/course`.
5. The app automatically creates a temporary `pl_ag_jobs` directory and maps it to `/jobs`.
6. If your container needs something different, switch to `Custom` and paste the full Docker start command instead.

Example:

```bash
docker run --rm -p 3000:3000 -v /path/to/course:/course -v /tmp/pl_ag_jobs-abc123:/jobs -e HOST_JOBS_DIR=/tmp/pl_ag_jobs-abc123 -v /var/run/docker.sock:/var/run/docker.sock --add-host=host.docker.internal:172.17.0.1 prairielearn/prairielearn:latest
```

The app does not modify PrairieLearn itself. Instead, it keeps a local question list where each item stores:

- a label
- a PrairieLearn path or full URL
- a PDF page number
- tags
- notes
- a flagged state

Use `Capture Current View` after navigating PrairieLearn in the embedded webview to save the current page into the selected question.

## Notes On Persistence

- PrairieLearn connection settings are stored in Electron's app data directory.
- Review sessions are stored in renderer `localStorage`, keyed by the selected PDF path, so returning to the same file restores your question mappings, flags, notes, and last viewed page.
