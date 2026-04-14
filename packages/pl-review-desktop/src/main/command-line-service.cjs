const { EventEmitter } = require("node:events");

function createTimeoutController(setTimeoutFn, clearTimeoutFn, timeoutMs, onTimeout) {
  if (!(Number(timeoutMs) > 0)) {
    return { cancel() {} };
  }

  const timeoutId = setTimeoutFn(onTimeout, Number(timeoutMs));
  return {
    cancel() {
      clearTimeoutFn(timeoutId);
    }
  };
}

function createCommandLineService({
  spawn,
  processRef = process,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout
}) {
  function runShellCommand(command, options = {}) {
    return new Promise((resolve) => {
      const stdoutChunks = [];
      const stderrChunks = [];
      let settled = false;

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

      const timeout = createTimeoutController(setTimeoutFn, clearTimeoutFn, options.timeoutMs, () => {
        child.kill("SIGTERM");
        setTimeoutFn(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 800);
        finish({
          ok: false,
          stdout: stdoutChunks.join(""),
          stderr: `${stderrChunks.join("")}Command timed out after ${options.timeoutMs}ms.\n`,
          error: "Command timed out."
        });
      });

      child.stdout.on("data", (data) => {
        stdoutChunks.push(data.toString());
      });

      child.stderr.on("data", (data) => {
        stderrChunks.push(data.toString());
      });

      child.on("error", (error) => {
        timeout.cancel();
        finish({
          ok: false,
          stdout: stdoutChunks.join(""),
          stderr: `${stderrChunks.join("")}${error.message}\n`,
          error: error.message
        });
      });

      child.on("close", (code) => {
        timeout.cancel();
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
    const daemonProbe = await runShellCommand('docker ps --format "{{.ID}}"', { timeoutMs: 5000 });
    if (!daemonProbe.ok) {
      return {
        ok: false,
        error: (daemonProbe.stderr || daemonProbe.error || "Docker Engine is not reachable.").trim()
      };
    }

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
    if (processRef.platform === "darwin") {
      command = "open -a Docker";
    } else if (processRef.platform === "win32") {
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
    if (processRef.platform === "darwin") {
      attempts.push("open -a Docker");
    } else if (processRef.platform === "win32") {
      attempts.push(`powershell -NoProfile -Command "Start-Process 'Docker Desktop'"`);
    } else if (processRef.platform === "linux") {
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
    return String(psOutput || "")
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

  return {
    runShellCommand,
    checkDockerInstalled,
    checkCommandLineDependencies,
    checkDockerDaemonRunning,
    getDockerDesktopStatus,
    focusDockerDesktop,
    startDockerDaemon,
    parsePrairieLearnContainers,
    listPrairieLearnContainers,
    getPortFromBaseUrl
  };
}

module.exports = {
  createCommandLineService
};
