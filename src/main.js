const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const SETTINGS_FILE = "settings.json";
const DEFAULT_CONFIG = {
  baseUrl: "http://127.0.0.1:3000",
  commandMode: "structured",
  autoLoadFromDiskOnConnect: true,
  courseDirectory: "",
  jobsDirectory: "",
  customStartCommand: "",
  startCommand: ""
};

let mainWindow = null;
let devWatchers = [];
let rendererReloadTimer = null;
let restartTimer = null;
let activeStartRun = null;

function getSettingsPath() {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}

function normalizeConfig(config = {}) {
  const hasLegacyStartCommand =
    typeof config.startCommand === "string" &&
    config.startCommand.trim() &&
    typeof config.commandMode !== "string" &&
    typeof config.customStartCommand !== "string";

  return {
    ...DEFAULT_CONFIG,
    ...config,
    autoLoadFromDiskOnConnect:
      typeof config.autoLoadFromDiskOnConnect === "boolean"
        ? config.autoLoadFromDiskOnConnect
        : DEFAULT_CONFIG.autoLoadFromDiskOnConnect,
    commandMode: hasLegacyStartCommand
      ? "custom"
      : ["structured", "custom", "reconnect"].includes(config.commandMode)
        ? config.commandMode
        : DEFAULT_CONFIG.commandMode,
    customStartCommand: hasLegacyStartCommand ? config.startCommand : config.customStartCommand || ""
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

function sendDockerOutput(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("docker-output", payload);
}

function runStartCommandWithStreaming(command, runState) {
  return new Promise((resolve) => {
    const chunks = [];
    let settled = false;
    let readyTriggered = false;
    let detectionBuffer = "";
    const readyPattern = /go to .*localhost:/i;

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    sendDockerOutput({ type: "chunk", stream: "info", text: `$ ${command}\n` });

    const child = spawn(command, {
      shell: "/bin/zsh"
    });
    runState.child = child;

    child.stdout.on("data", (data) => {
      const text = data.toString();
      chunks.push(text);
      sendDockerOutput({ type: "chunk", stream: "stdout", text });
      detectionBuffer = `${detectionBuffer}${text}`.slice(-12000);
      if (!readyTriggered && readyPattern.test(detectionBuffer)) {
        readyTriggered = true;
        sendDockerOutput({
          type: "chunk",
          stream: "info",
          text: 'Detected readiness trigger: "Go to localhost".\n'
        });
        finish({
          ok: true,
          warning: "",
          output: chunks.join(""),
          readyTriggered: true
        });
      }
    });

    child.stderr.on("data", (data) => {
      const text = data.toString();
      chunks.push(text);
      sendDockerOutput({ type: "chunk", stream: "stderr", text });
      detectionBuffer = `${detectionBuffer}${text}`.slice(-12000);
      if (!readyTriggered && readyPattern.test(detectionBuffer)) {
        readyTriggered = true;
        sendDockerOutput({
          type: "chunk",
          stream: "info",
          text: 'Detected readiness trigger: "Go to localhost".\n'
        });
        finish({
          ok: true,
          warning: "",
          output: chunks.join(""),
          readyTriggered: true
        });
      }
    });

    child.on("error", (error) => {
      const text = `${error.message}\n`;
      chunks.push(text);
      sendDockerOutput({ type: "chunk", stream: "stderr", text });
      finish({
        ok: false,
        warning: error.message,
        output: chunks.join("")
      });
    });

    child.on("close", (code, signal) => {
      runState.child = null;
      if (runState.cancelled) {
        finish({
          ok: false,
          warning: "Start command stopped by user.",
          output: chunks.join("")
        });
        return;
      }

      if (code !== 0) {
        const warning = `Start command exited with code ${code}${signal ? ` (${signal})` : ""}.`;
        sendDockerOutput({ type: "chunk", stream: "stderr", text: `${warning}\n` });
        finish({
          ok: false,
          warning,
          output: chunks.join("")
        });
        return;
      }

      finish({
        ok: true,
        warning: "",
        output: chunks.join(""),
        readyTriggered: false
      });
    });
  });
}

function getPortFromBaseUrl(baseUrl) {
  try {
    const url = new URL(baseUrl);
    if (url.port) {
      return Number(url.port);
    }
    return url.protocol === "https:" ? 443 : 80;
  } catch (error) {
    return 3000;
  }
}

function runShellCommandWithStreaming(command, runState) {
  return new Promise((resolve) => {
    const chunks = [];
    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const child = spawn(command, {
      shell: "/bin/zsh"
    });
    runState.child = child;

    child.stdout.on("data", (data) => {
      const text = data.toString();
      chunks.push(text);
      sendDockerOutput({ type: "chunk", stream: "stdout", text });
    });

    child.stderr.on("data", (data) => {
      const text = data.toString();
      chunks.push(text);
      sendDockerOutput({ type: "chunk", stream: "stderr", text });
    });

    child.on("error", (error) => {
      const text = `${error.message}\n`;
      chunks.push(text);
      sendDockerOutput({ type: "chunk", stream: "stderr", text });
      finish({
        ok: false,
        output: chunks.join(""),
        error: error.message
      });
    });

    child.on("close", (code) => {
      runState.child = null;
      if (runState.cancelled) {
        finish({
          ok: false,
          output: chunks.join(""),
          error: "Command stopped by user."
        });
        return;
      }

      finish({
        ok: code === 0,
        output: chunks.join(""),
        error: code === 0 ? "" : `Command exited with code ${code}.`
      });
    });
  });
}

function runShellCommand(command, options = {}) {
  return new Promise((resolve) => {
    const stdoutChunks = [];
    const stderrChunks = [];
    let settled = false;
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 0;

    const child = spawn(command, {
      shell: "/bin/zsh"
    });

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    let timeoutId = null;
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 800);
        finish({
          ok: false,
          stdout: stdoutChunks.join(""),
          stderr: `${stderrChunks.join("")}Command timed out after ${timeoutMs}ms.\n`,
          error: "Command timed out."
        });
      }, timeoutMs);
    }

    child.stdout.on("data", (data) => {
      stdoutChunks.push(data.toString());
    });

    child.stderr.on("data", (data) => {
      stderrChunks.push(data.toString());
    });

    child.on("error", (error) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      finish({
        ok: false,
        stdout: stdoutChunks.join(""),
        stderr: `${stderrChunks.join("")}${error.message}\n`,
        error: error.message
      });
    });

    child.on("close", (code) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      finish({
        ok: code === 0,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        error: code === 0 ? "" : `Command exited with code ${code}.`
      });
    });
  });
}

async function checkDockerInstalled() {
  const result = await runShellCommand("docker --version", { timeoutMs: 4000 });
  if (!result.ok) {
    return {
      ok: false,
      error: (result.stderr || result.error || "Docker CLI is not available.").trim()
    };
  }

  return {
    ok: true,
    version: (result.stdout || result.stderr || "").trim()
  };
}

async function checkCommandLineDependencies() {
  const dockerResult = await runShellCommand("docker --version", { timeoutMs: 4000 });
  const gitResult = await runShellCommand("git --version", { timeoutMs: 4000 });
  const ghVersionResult = await runShellCommand("gh --version", { timeoutMs: 4000 });

  const dockerOk = dockerResult.ok;
  const gitOk = gitResult.ok;
  const ghInstalled = ghVersionResult.ok;

  let ghAuthenticated = false;
  let ghAuthMessage = "";
  if (ghInstalled) {
    const ghAuthResult = await runShellCommand("gh auth status", { timeoutMs: 5000 });
    ghAuthenticated = ghAuthResult.ok;
    ghAuthMessage = (ghAuthResult.stdout || ghAuthResult.stderr || ghAuthResult.error || "").trim();
  }

  const warnings = [];
  if (!ghInstalled) {
    warnings.push("`gh` is not installed.");
  } else if (!ghAuthenticated) {
    warnings.push("`gh` is installed but not authenticated.");
  }

  return {
    ok: dockerOk && gitOk,
    docker: {
      ok: dockerOk,
      version: (dockerResult.stdout || dockerResult.stderr || "").trim(),
      error: (dockerResult.stderr || dockerResult.error || "").trim()
    },
    git: {
      ok: gitOk,
      version: (gitResult.stdout || gitResult.stderr || "").trim(),
      error: (gitResult.stderr || gitResult.error || "").trim()
    },
    gh: {
      installed: ghInstalled,
      authenticated: ghAuthenticated,
      version: (ghVersionResult.stdout || ghVersionResult.stderr || "").trim(),
      authMessage: ghAuthMessage
    },
    warnings
  };
}

async function checkDockerDaemonRunning() {
  // `docker ps` requires an active daemon; it is a reliable readiness signal.
  const daemonProbe = await runShellCommand('docker ps --format "{{.ID}}"', { timeoutMs: 5000 });
  if (!daemonProbe.ok) {
    return {
      ok: false,
      error: (daemonProbe.stderr || daemonProbe.error || "Docker Engine is not reachable.").trim()
    };
  }

  // Best-effort server version fetch; daemon readiness is determined by the probe above.
  const versionProbe = await runShellCommand('docker version --format "{{.Server.Version}}"', { timeoutMs: 4000 });
  const version = (versionProbe.stdout || "").trim();

  return {
    ok: true,
    version: version && version !== "<no value>" ? version : ""
  };
}

async function getDockerDesktopStatus() {
  const result = await runShellCommand("docker desktop status --format json", { timeoutMs: 3500 });
  if (!result.ok) {
    return {
      ok: false,
      error: (result.stderr || result.error || "Could not query Docker Desktop status.").trim()
    };
  }

  const text = String(result.stdout || "").trim();
  if (!text) {
    return {
      ok: false,
      error: "Docker Desktop status command returned no output."
    };
  }

  try {
    const parsed = JSON.parse(text);
    return {
      ok: true,
      status: String(parsed?.Status || "").trim()
    };
  } catch (error) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        return {
          ok: true,
          status: String(parsed?.Status || "").trim()
        };
      } catch {
        // Fall through.
      }
    }
    return {
      ok: false,
      error: "Docker Desktop status output could not be parsed."
    };
  }
}

async function focusDockerDesktop() {
  let command = "";
  if (process.platform === "darwin") {
    command = "open -a Docker";
  } else if (process.platform === "win32") {
    command = `powershell -NoProfile -Command "Start-Process 'Docker Desktop'"`;
  }
  if (!command) {
    return;
  }
  await runShellCommand(command, { timeoutMs: 3000 });
}

async function startDockerDaemon(mode = "start") {
  const alreadyRunning = await checkDockerDaemonRunning();
  if (alreadyRunning.ok) {
    return {
      ok: true,
      alreadyRunning: true,
      message: "Docker Engine is already running."
    };
  }

  if (mode !== "restart") {
    const desktopStatus = await getDockerDesktopStatus();
    if (desktopStatus.ok && desktopStatus.status.toLowerCase() === "paused") {
      await focusDockerDesktop();
      return {
        ok: false,
        paused: true,
        error:
          "Docker Desktop is paused. Resume it in Docker Desktop to continue. Use Restart Docker Engine only if you need a full reboot."
      };
    }
  }

  const attempts = mode === "restart" ? ["docker desktop restart"] : ["docker desktop start"];
  if (process.platform === "darwin") {
    attempts.push("open -a Docker");
  } else if (process.platform === "win32") {
    attempts.push(`powershell -NoProfile -Command "Start-Process 'Docker Desktop'"`);
  } else if (process.platform === "linux") {
    attempts.push("systemctl --user start docker-desktop");
  }

  const errors = [];
  for (const command of attempts) {
    const result = await runShellCommand(command, { timeoutMs: 5000 });
    if (result.ok) {
      return {
        ok: true,
        alreadyRunning: false,
        command,
        message: "Docker Engine start command sent."
      };
    }
    const errorText = (result.stderr || result.error || "Command failed.").trim();
    errors.push(`${command}: ${errorText}`);
  }

  return {
    ok: false,
    error: errors.join("\n")
  };
}

function parsePrairieLearnContainers(psOutput) {
  return psOutput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, image, ports, status, names] = line.split("\t");
      return { id, image, ports, status, names };
    })
    .filter((container) => (container.image || "").toLowerCase().includes("prairielearn"));
}

async function listPrairieLearnContainers() {
  const result = await runShellCommand(
    'docker ps --format "{{.ID}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}\t{{.Names}}"'
  );

  if (!result.ok) {
    return {
      ok: false,
      error: result.error || result.stderr || "Could not list running Docker containers.",
      containers: []
    };
  }

  return {
    ok: true,
    containers: parsePrairieLearnContainers(result.stdout)
  };
}

async function stopRunningPrairieLearnContainers(baseUrl, runState) {
  if (runState.cancelled) {
    return;
  }

  const port = getPortFromBaseUrl(baseUrl);
  sendDockerOutput({
    type: "chunk",
    stream: "info",
    text: `Checking for running containers on host port ${port}...\n`
  });

  const listResult = await runShellCommandWithStreaming(
    `docker ps --filter publish=${port} --format "{{.ID}} {{.Image}}"`,
    runState
  );

  if (!listResult.ok) {
    sendDockerOutput({
      type: "chunk",
      stream: "stderr",
      text: `Could not list running containers on port ${port}. ${listResult.error}\n`
    });
    return;
  }

  const lines = listResult.output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    sendDockerOutput({
      type: "chunk",
      stream: "info",
      text: "No running PrairieLearn containers needed stopping.\n"
    });
    return;
  }

  const ids = lines.map((line) => line.split(/\s+/)[0]).filter(Boolean);
  sendDockerOutput({
    type: "chunk",
    stream: "info",
    text: `Stopping ${ids.length} running container(s): ${ids.join(", ")}\n`
  });

  const stopResult = await runShellCommandWithStreaming(`docker stop ${ids.join(" ")}`, runState);
  if (!stopResult.ok) {
    sendDockerOutput({
      type: "chunk",
      stream: "stderr",
      text: `Container stop command failed. ${stopResult.error}\n`
    });
  } else {
    sendDockerOutput({
      type: "chunk",
      stream: "info",
      text: "Container stop complete.\n"
    });
  }
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

async function waitForPrairieLearn(baseUrl, runState) {
  while (!runState.cancelled) {
    if (await checkUrlReady(baseUrl)) {
      return { ok: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return {
    ok: false,
    error: "PrairieLearn start was stopped before it became reachable."
  };
}

async function runPrairieLearnStart(normalizedConfig, options = { resetLog: true }) {
  if (activeStartRun) {
    return {
      ok: false,
      config: normalizedConfig,
      error: "A PrairieLearn start operation is already running."
    };
  }

  const runState = {
    cancelled: false,
    child: null
  };
  activeStartRun = runState;

  if (options.resetLog !== false) {
    sendDockerOutput({ type: "reset" });
  }

  const normalized = normalizedConfig;
  if (!normalized.startCommand.trim()) {
    activeStartRun = null;
    return {
      ok: false,
      error:
        normalized.commandMode === "structured"
          ? "Choose the local course directory to mount as /course before starting PrairieLearn."
          : "Add a Docker start command in PrairieLearn Connection before starting PrairieLearn."
    };
  }

  sendDockerOutput({ type: "chunk", stream: "info", text: "Running PrairieLearn start command...\n" });

  const commandResult = await runStartCommandWithStreaming(normalized.startCommand, runState);
  const commandOutput = commandResult.output.trim();
  const commandWarning = commandResult.warning;

  if (commandResult.readyTriggered) {
    activeStartRun = null;
    sendDockerOutput({ type: "chunk", stream: "info", text: "Using log-based readiness trigger.\n" });
    return {
      ok: true,
      config: normalized,
      warning: commandWarning || "",
      output: commandOutput
    };
  }

  if (!commandResult.ok && !runState.cancelled) {
    activeStartRun = null;
    return {
      ok: false,
      config: normalized,
      error: commandWarning || "Start command failed.",
      output: commandOutput
    };
  }

  if (runState.cancelled) {
    activeStartRun = null;
    return {
      ok: false,
      config: normalized,
      error: "PrairieLearn start stopped by user.",
      output: commandOutput
    };
  }

  sendDockerOutput({
    type: "chunk",
    stream: "info",
    text: `Checking PrairieLearn readiness at ${normalized.baseUrl}...\n`
  });

  const ready = await waitForPrairieLearn(normalized.baseUrl, runState);
  activeStartRun = null;
  if (ready.ok) {
    sendDockerOutput({ type: "chunk", stream: "info", text: "PrairieLearn is reachable.\n" });
    return {
      ok: true,
      config: normalized,
      warning: commandWarning || "",
      output: commandOutput
    };
  }

  sendDockerOutput({ type: "chunk", stream: "stderr", text: `${ready.error}\n` });
  return {
    ok: false,
    config: normalized,
    error: commandWarning ? `${commandWarning}\n\n${ready.error}` : ready.error,
    output: commandOutput
  };
}

async function startPrairieLearn(config) {
  const normalized = await writeConfig(config);
  return runPrairieLearnStart(normalized, { resetLog: true });
}

async function restartPrairieLearn(config) {
  if (activeStartRun) {
    return {
      ok: false,
      config,
      error: "A PrairieLearn start operation is already running."
    };
  }

  const normalized = await writeConfig(config);
  sendDockerOutput({ type: "reset" });
  sendDockerOutput({ type: "chunk", stream: "info", text: "Starting clean restart...\n" });
  await stopRunningPrairieLearnContainers(normalized.baseUrl, { cancelled: false, child: null });
  return runPrairieLearnStart(normalized, { resetLog: false });
}

async function reconnectPrairieLearn(config) {
  if (activeStartRun) {
    return {
      ok: false,
      config,
      error: "A PrairieLearn start operation is already running."
    };
  }

  const normalized = await writeConfig(config);
  sendDockerOutput({ type: "reset" });
  sendDockerOutput({ type: "chunk", stream: "info", text: "Checking for running PrairieLearn containers...\n" });

  const listed = await listPrairieLearnContainers();
  if (!listed.ok) {
    sendDockerOutput({ type: "chunk", stream: "stderr", text: `${listed.error}\n` });
    return {
      ok: false,
      config: normalized,
      error: listed.error
    };
  }

  if (listed.containers.length === 0) {
    const message = "No running PrairieLearn containers were found.";
    sendDockerOutput({ type: "chunk", stream: "stderr", text: `${message}\n` });
    return {
      ok: false,
      config: normalized,
      error: message
    };
  }

  listed.containers.forEach((container) => {
    sendDockerOutput({
      type: "chunk",
      stream: "info",
      text: `Found ${container.id} (${container.image}) on ${container.ports || "no published ports"}.\n`
    });
  });

  const runState = {
    cancelled: false,
    child: null
  };
  activeStartRun = runState;
  sendDockerOutput({
    type: "chunk",
    stream: "info",
    text: `Waiting for PrairieLearn at ${normalized.baseUrl}...\n`
  });

  const ready = await waitForPrairieLearn(normalized.baseUrl, runState);
  activeStartRun = null;
  if (ready.ok) {
    sendDockerOutput({ type: "chunk", stream: "info", text: "PrairieLearn is reachable.\n" });
    return {
      ok: true,
      config: normalized
    };
  }

  sendDockerOutput({ type: "chunk", stream: "stderr", text: `${ready.error}\n` });
  return {
    ok: false,
    config: normalized,
    error: ready.error
  };
}

async function stopPrairieLearnStart() {
  if (!activeStartRun) {
    return { ok: false, error: "No PrairieLearn start operation is running." };
  }

  activeStartRun.cancelled = true;
  sendDockerOutput({ type: "chunk", stream: "info", text: "Stop requested. Terminating running command...\n" });
  if (activeStartRun.child) {
    activeStartRun.child.kill("SIGTERM");
    setTimeout(() => {
      if (activeStartRun && activeStartRun.child) {
        activeStartRun.child.kill("SIGKILL");
      }
    }, 2000);
  }

  return { ok: true };
}

async function stopConnectedPrairieLearn(baseUrl) {
  const port = getPortFromBaseUrl(baseUrl || "http://127.0.0.1:3000");
  sendDockerOutput({
    type: "chunk",
    stream: "info",
    text: `Stopping connected PrairieLearn container(s) on host port ${port}...\n`
  });

  const listResult = await runShellCommand(
    `docker ps --filter publish=${port} --format "{{.ID}} {{.Image}} {{.Names}}"`
  );

  if (!listResult.ok) {
    const errorMessage = listResult.error || listResult.stderr || "Could not list running containers.";
    sendDockerOutput({ type: "chunk", stream: "stderr", text: `${errorMessage}\n` });
    return { ok: false, error: errorMessage };
  }

  const ids = listResult.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[0])
    .filter(Boolean);

  if (ids.length === 0) {
    const message = "No running container found on the configured PrairieLearn port.";
    sendDockerOutput({ type: "chunk", stream: "info", text: `${message}\n` });
    return { ok: false, error: message };
  }

  const stopResult = await runShellCommand(`docker stop ${ids.join(" ")}`);
  if (!stopResult.ok) {
    const errorMessage = stopResult.error || stopResult.stderr || "Failed to stop PrairieLearn container.";
    sendDockerOutput({ type: "chunk", stream: "stderr", text: `${errorMessage}\n` });
    return { ok: false, error: errorMessage };
  }

  const stopped = stopResult.stdout.trim();
  if (stopped) {
    sendDockerOutput({ type: "chunk", stream: "info", text: `${stopped}\n` });
  }
  sendDockerOutput({ type: "chunk", stream: "info", text: "Connected PrairieLearn container stopped.\n" });
  return { ok: true, stoppedIds: ids };
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
ipcMain.handle("select-directory", async () => selectDirectory());
ipcMain.handle("ensure-jobs-directory", async (_event, existingPath) => ensureJobsDirectory(existingPath));
ipcMain.handle("check-cli-dependencies", async () => checkCommandLineDependencies());
ipcMain.handle("check-docker-installed", async () => checkDockerInstalled());
ipcMain.handle("check-docker-daemon-running", async () => checkDockerDaemonRunning());
ipcMain.handle("start-docker-daemon", async (_event, mode) => startDockerDaemon(mode));
ipcMain.handle("list-prairielearn-containers", async () => listPrairieLearnContainers());
ipcMain.handle("get-config", async () => readConfig());
ipcMain.handle("save-config", async (_event, config) => writeConfig(config));
ipcMain.handle("start-prairielearn", async (_event, config) => startPrairieLearn(config));
ipcMain.handle("restart-prairielearn", async (_event, config) => restartPrairieLearn(config));
ipcMain.handle("reconnect-prairielearn", async (_event, config) => reconnectPrairieLearn(config));
ipcMain.handle("stop-prairielearn-start", async () => stopPrairieLearnStart());
ipcMain.handle("stop-connected-prairielearn", async (_event, baseUrl) => stopConnectedPrairieLearn(baseUrl));
ipcMain.handle("open-external", async (_event, url) => {
  if (url) {
    await shell.openExternal(url);
  }
});
ipcMain.on("webview-event", (_event, payload) => {
  if (!payload || typeof payload !== "object") {
    return;
  }

  console.log("[webview-event]", payload);
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
});
