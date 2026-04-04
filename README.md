# PrairieLearn Review Desktop

PrairieLearn Review Desktop is a local Electron app for reviewing a PDF assessment next to a PrairieLearn instance running in Docker. The app lets you:

- choose a PDF on launch
- start a locally configured PrairieLearn container
- view the PDF and PrairieLearn side by side
- move between locally defined question records
- sync each question to a PrairieLearn URL and a PDF page
- flag questions, add notes, and resume later from local storage

## Requirements

- Node.js 20+
- Docker Desktop or another local Docker runtime

## Install

```bash
npm install
```

## Run

```bash
npm start
```

## Dev Mode

```bash
npm run dev
```

In dev mode, saving files under `src/renderer/` reloads the window, while saving `src/main.js` or `src/preload.js` relaunches Electron.

## First Launch

1. Click `Choose PDF` or drag a PDF into the window.
2. Open the `PrairieLearn Connection` panel.
3. Set `Base URL` to the PrairieLearn URL you expect locally, such as `http://127.0.0.1:3000`.
4. Leave the connection mode on `Structured` and choose the local course directory to mount as `/course`.
5. If your container needs something different, switch to `Custom` and paste the full Docker start command instead.

Example:

```bash
docker run -d --rm --name pl-review -p 3000:3000 -v /path/to/course:/course prairielearn/prairielearn
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
