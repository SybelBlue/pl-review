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

## First Launch

1. Pick the assessment PDF when the app opens.
2. Open the `PrairieLearn Connection` panel.
3. Set `Base URL` to the PrairieLearn URL you expect locally, such as `http://127.0.0.1:3000`.
4. Paste a Docker start command that launches your immutable PrairieLearn container.

Example:

```bash
docker run -d --rm --name pl-review -p 3000:3000 your-prairielearn-image
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

