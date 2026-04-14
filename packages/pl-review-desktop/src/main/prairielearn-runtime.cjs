function createPrairieLearnRuntime({
  spawn,
  fetch,
  writeConfig,
  runShellCommand,
  listPrairieLearnContainers,
  getPortFromBaseUrl,
  sendDockerOutput,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout
}) {
  let activeStartRun = null;

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

      const appendChunk = (stream, data) => {
        const text = data.toString();
        chunks.push(text);
        sendDockerOutput({ type: "chunk", stream, text });
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
      };

      child.stdout.on("data", (data) => appendChunk("stdout", data));
      child.stderr.on("data", (data) => appendChunk("stderr", data));

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

  async function checkUrlReady(url) {
    const controller = new AbortController();
    const timeoutId = setTimeoutFn(() => controller.abort(), 2500);

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
      clearTimeoutFn(timeoutId);
    }
  }

  async function waitForPrairieLearn(baseUrl, runState) {
    while (!runState.cancelled) {
      if (await checkUrlReady(baseUrl)) {
        return { ok: true };
      }

      await new Promise((resolve) => setTimeoutFn(resolve, 1000));
    }

    return {
      ok: false,
      error: "PrairieLearn start was stopped before it became reachable."
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
      setTimeoutFn(() => {
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

  return {
    startPrairieLearn,
    restartPrairieLearn,
    reconnectPrairieLearn,
    stopPrairieLearnStart,
    stopConnectedPrairieLearn,
    runPrairieLearnStart
  };
}

module.exports = {
  createPrairieLearnRuntime
};
