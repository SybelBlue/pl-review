const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const { exec } = require("node:child_process");

const execAsync = promisify(exec);
const SETTINGS_FILE = "settings.json";
const DEFAULT_CONFIG = {
  baseUrl: "http://127.0.0.1:3000",
  startCommand: "",
  readyTimeoutMs: 30000
};

let mainWindow = null;

function getSettingsPath() {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}

function normalizeConfig(config = {}) {
  const readyTimeoutMs = Number(config.readyTimeoutMs) || DEFAULT_CONFIG.readyTimeoutMs;
  return {
    ...DEFAULT_CONFIG,
    ...config,
    readyTimeoutMs: Math.max(5000, readyTimeoutMs)
  };
}

async function readConfig() {
  try {
    const raw = await fs.readFile(getSettingsPath(), "utf8");
    return normalizeConfig(JSON.parse(raw));
  } catch (error) {
    return { ...DEFAULT_CONFIG };
  }
}

async function writeConfig(config) {
  const normalized = normalizeConfig(config);
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(getSettingsPath(), JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

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

function serializeCommandError(error) {
  const parts = [];
  if (error.message) {
    parts.push(error.message.trim());
  }
  if (typeof error.stderr === "string" && error.stderr.trim()) {
    parts.push(error.stderr.trim());
  }
  if (typeof error.stdout === "string" && error.stdout.trim()) {
    parts.push(error.stdout.trim());
  }
  return parts.join("\n");
}

async function checkUrlReady(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal
    });
    return response.status < 500;
  } catch (error) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForPrairieLearn(baseUrl, timeoutMs) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await checkUrlReady(baseUrl)) {
      return { ok: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return {
    ok: false,
    error: `PrairieLearn did not become reachable at ${baseUrl} within ${Math.round(
      timeoutMs / 1000
    )} seconds.`
  };
}

async function startPrairieLearn(config) {
  const normalized = await writeConfig(config);

  if (!normalized.startCommand.trim()) {
    return {
      ok: false,
      error: "Add a Docker start command in PrairieLearn Connection before starting PrairieLearn."
    };
  }

  let commandOutput = "";
  let commandWarning = "";

  try {
    const result = await execAsync(normalized.startCommand, {
      shell: "/bin/zsh",
      timeout: 15000,
      maxBuffer: 1024 * 1024
    });
    commandOutput = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  } catch (error) {
    commandWarning = serializeCommandError(error);
  }

  const ready = await waitForPrairieLearn(normalized.baseUrl, normalized.readyTimeoutMs);
  if (ready.ok) {
    return {
      ok: true,
      config: normalized,
      warning: commandWarning || "",
      output: commandOutput
    };
  }

  return {
    ok: false,
    config: normalized,
    error: commandWarning ? `${commandWarning}\n\n${ready.error}` : ready.error,
    output: commandOutput
  };
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

ipcMain.handle("select-pdf", async () => selectPdfFile());
ipcMain.handle("get-config", async () => readConfig());
ipcMain.handle("save-config", async (_event, config) => writeConfig(config));
ipcMain.handle("start-prairielearn", async (_event, config) => startPrairieLearn(config));
ipcMain.handle("open-external", async (_event, url) => {
  if (url) {
    await shell.openExternal(url);
  }
});

app.whenReady().then(() => {
  createWindow();

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

