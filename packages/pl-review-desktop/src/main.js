const { app, BrowserWindow, dialog, ipcMain, shell, webContents } = require("electron");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { PuppeteerSidecarService, createLogger } = require("pl-puppeteer-sidecar");
const { createConfigStore } = require("./main/config-store.cjs");
const { createCommandLineService } = require("./main/command-line-service.cjs");
const { createPrairieLearnRuntime } = require("./main/prairielearn-runtime.cjs");
const { createReviewService } = require("./main/review-service.cjs");
const { createWebviewAttachService } = require("./main/webview-attach.cjs");

const REMOTE_DEBUGGING_PORT = Number(process.env.PL_REVIEW_REMOTE_DEBUGGING_PORT) || 8315;
app.commandLine.appendSwitch("remote-debugging-port", String(REMOTE_DEBUGGING_PORT));

let mainWindow = null;
let devWatchers = [];
let rendererReloadTimer = null;
let restartTimer = null;

const prairieLearnSidecar = new PuppeteerSidecarService({
  logger: createLogger({ verbose: process.env.PL_REVIEW_SIDECAR_VERBOSE === "1" })
});

const configStore = createConfigStore({
  app,
  fs,
  path
});
const reviewService = createReviewService({
  readConfig: configStore.readConfig,
  writeConfig: configStore.writeConfig,
  sidecar: prairieLearnSidecar,
  fs,
  path
});

const commandLineService = createCommandLineService({
  spawn
});

const webviewAttachService = createWebviewAttachService({
  webContents,
  fetch,
  remoteDebuggingPort: REMOTE_DEBUGGING_PORT
});

function sendDockerOutput(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("docker-output", payload);
}

function sendPrairieLearnAutomationEvent(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("prairielearn-automation-event", payload);
}

const prairieLearnRuntime = createPrairieLearnRuntime({
  spawn,
  fetch,
  writeConfig: configStore.writeConfig,
  runShellCommand: commandLineService.runShellCommand,
  listPrairieLearnContainers: commandLineService.listPrairieLearnContainers,
  getPortFromBaseUrl: commandLineService.getPortFromBaseUrl,
  sendDockerOutput
});

prairieLearnSidecar.on("event", (payload) => {
  sendPrairieLearnAutomationEvent(payload);
});

async function selectPdfFile() {
  const result = await dialog.showOpenDialog({
    title: "Choose Assessment PDF",
    properties: ["openFile"],
    filters: [{ name: "PDF Documents", extensions: ["pdf"] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  return {
    path: filePath,
    name: path.basename(filePath)
  };
}

async function selectReviewManifestFile() {
  const result = await dialog.showOpenDialog({
    title: "Choose Review Manifest",
    properties: ["openFile"],
    filters: [{ name: "JSON Files", extensions: ["json"] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
}

async function selectDirectory() {
  const result = await dialog.showOpenDialog({
    title: "Choose Course Directory",
    properties: ["openDirectory"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
}

async function ensureJobsDirectory(existingPath = "") {
  const preferredPath = String(existingPath || "").trim();
  if (preferredPath) {
    await fs.mkdir(preferredPath, { recursive: true });
    return preferredPath;
  }

  const tempPrefix = path.join(os.tmpdir(), "pl_ag_jobs-");
  return fs.mkdtemp(tempPrefix);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1680,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#f5efe4",
    title: "PrairieLearn Review Desktop",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function scheduleRendererReload() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  clearTimeout(rendererReloadTimer);
  rendererReloadTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reloadIgnoringCache();
    }
  }, 120);
}

function scheduleAppRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    app.relaunch();
    app.exit(0);
  }, 180);
}

function startDevWatchers() {
  if (process.env.PL_REVIEW_DEV_WATCH !== "1" || devWatchers.length > 0) {
    return;
  }

  const watchTargets = [
    {
      target: path.join(__dirname, "renderer"),
      onChange: scheduleRendererReload,
      recursive: true
    },
    {
      target: path.join(__dirname, "main.js"),
      onChange: scheduleAppRestart
    },
    {
      target: path.join(__dirname, "preload.js"),
      onChange: scheduleAppRestart
    },
    {
      target: path.join(__dirname, "main"),
      onChange: scheduleAppRestart,
      recursive: true
    }
  ];

  devWatchers = watchTargets.map(({ target, onChange, recursive }) =>
    fsSync.watch(target, { recursive: Boolean(recursive) }, (_eventType, filename) => {
      if (filename && filename.startsWith(".")) {
        return;
      }
      onChange();
    })
  );
}

function stopDevWatchers() {
  devWatchers.forEach((watcher) => watcher.close());
  devWatchers = [];
  clearTimeout(rendererReloadTimer);
  clearTimeout(restartTimer);
}

ipcMain.handle("select-pdf", async () => selectPdfFile());
ipcMain.handle("select-review-manifest", async () => selectReviewManifestFile());
ipcMain.handle("select-directory", async () => selectDirectory());
ipcMain.handle("ensure-jobs-directory", async (_event, existingPath) => ensureJobsDirectory(existingPath));
ipcMain.handle("check-cli-dependencies", async () => commandLineService.checkCommandLineDependencies());
ipcMain.handle("check-docker-installed", async () => commandLineService.checkDockerInstalled());
ipcMain.handle("check-docker-daemon-running", async () => commandLineService.checkDockerDaemonRunning());
ipcMain.handle("start-docker-daemon", async (_event, mode) => commandLineService.startDockerDaemon(mode));
ipcMain.handle("list-prairielearn-containers", async () => commandLineService.listPrairieLearnContainers());
ipcMain.handle("get-config", async () => configStore.readConfig());
ipcMain.handle("save-config", async (_event, config) => configStore.writeConfig(config));
ipcMain.handle("start-prairielearn", async (_event, config) => prairieLearnRuntime.startPrairieLearn(config));
ipcMain.handle("restart-prairielearn", async (_event, config) => prairieLearnRuntime.restartPrairieLearn(config));
ipcMain.handle("reconnect-prairielearn", async (_event, config) => prairieLearnRuntime.reconnectPrairieLearn(config));
ipcMain.handle("stop-prairielearn-start", async () => prairieLearnRuntime.stopPrairieLearnStart());
ipcMain.handle("stop-connected-prairielearn", async (_event, baseUrl) =>
  prairieLearnRuntime.stopConnectedPrairieLearn(baseUrl)
);
ipcMain.handle("attach-prairielearn-webview", async (event, guestWebContentsId) => {
  const guestContents = webviewAttachService.getGuestWebContents(event.sender, guestWebContentsId);
  const targetId = await webviewAttachService.getGuestTargetId(guestContents);
  const browserWSEndpoint = await webviewAttachService.getRemoteDebuggingBrowserWSEndpoint();
  return prairieLearnSidecar.attach({
    browserWSEndpoint,
    targetId,
    webContentsId: guestContents.id
  });
});
ipcMain.handle("detach-prairielearn-webview", async () => prairieLearnSidecar.detach());
ipcMain.handle("get-prairielearn-status", async () => prairieLearnSidecar.getStatus());
ipcMain.handle("reload-prairielearn-from-disk", async () => prairieLearnSidecar.reloadFromDisk());
ipcMain.handle("get-prairielearn-current", async () => prairieLearnSidecar.current());
ipcMain.handle("go-to-next-prairielearn-question", async () => prairieLearnSidecar.next());
ipcMain.handle("go-to-previous-prairielearn-question", async () => prairieLearnSidecar.prev());
ipcMain.handle("go-to-prairielearn-url", async (_event, url) => prairieLearnSidecar.goto(url));
ipcMain.handle("load-review-context", async () => reviewService.loadContext());
ipcMain.handle("select-review-sequence", async (_event, sequenceId) => reviewService.selectSequence(sequenceId));
ipcMain.handle("select-review-bank", async (_event, bankSlug) => reviewService.selectBank(bankSlug));
ipcMain.handle("search-review-questions", async (_event, bankSlug, query) => reviewService.search(bankSlug, query));
ipcMain.handle("update-review-tags", async (_event, bankSlug, tags) => reviewService.setTags(bankSlug, tags));
ipcMain.handle("jump-to-review-question", async (_event, bankSlug, questionIndex) => reviewService.jump(bankSlug, questionIndex));
ipcMain.handle("apply-review-action", async (_event, bankSlug, action) => reviewService.act(bankSlug, action));
ipcMain.handle("undo-review-action", async (_event, bankSlug) => reviewService.undo(bankSlug));
ipcMain.handle("open-external", async (_event, url) => {
  if (url) {
    await shell.openExternal(url);
  }
});

app.whenReady().then(() => {
  createWindow();
  startDevWatchers();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopDevWatchers();
  void prairieLearnSidecar.close();
});
