const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createPrairieLearnRuntime } = require("../../src/main/prairielearn-runtime.cjs");

function createSpawnStub(map, state = {}) {
  return (command) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
    };

    state.children = state.children || {};
    state.children[command] = child;

    process.nextTick(() => {
      const result = map[command];
      if (!result) {
        child.emit("close", 0, null);
        return;
      }
      if (result.holdOpen) {
        return;
      }
      if (result.stdout) {
        child.stdout.emit("data", Buffer.from(result.stdout));
      }
      if (result.stderr) {
        child.stderr.emit("data", Buffer.from(result.stderr));
      }
      child.emit("close", result.code ?? 0, result.signal ?? null);
    });

    return child;
  };
}

function createRuntime(options = {}) {
  const outputs = [];
  const runtime = createPrairieLearnRuntime({
    spawn: options.spawn,
    fetch: options.fetch || (async () => ({ status: 200 })),
    writeConfig: async (config) => config,
    runShellCommand: options.runShellCommand || (async () => ({ ok: true, stdout: "", stderr: "", error: "" })),
    listPrairieLearnContainers:
      options.listPrairieLearnContainers || (async () => ({ ok: true, containers: [{ id: "c1", image: "prairielearn" }] })),
    getPortFromBaseUrl: options.getPortFromBaseUrl || (() => 3000),
    sendDockerOutput(payload) {
      outputs.push(payload);
    },
    setTimeoutFn: options.setTimeoutFn || setTimeout,
    clearTimeoutFn: options.clearTimeoutFn || clearTimeout
  });

  return { runtime, outputs };
}

test("prairielearn-runtime starts successfully from log-based readiness output", async () => {
  const { runtime, outputs } = createRuntime({
    spawn: createSpawnStub({
      "docker run review": {
        stdout: "Booting...\nGo to localhost:3000\n"
      }
    })
  });

  const result = await runtime.startPrairieLearn({
    commandMode: "structured",
    baseUrl: "http://127.0.0.1:3000",
    startCommand: "docker run review"
  });

  assert.equal(result.ok, true);
  assert.match(outputs.map((entry) => entry.text || "").join(""), /Using log-based readiness trigger/);
});

test("prairielearn-runtime surfaces command failure", async () => {
  const { runtime } = createRuntime({
    spawn: createSpawnStub({
      "docker run broken": {
        stderr: "boom\n",
        code: 1
      }
    })
  });

  const result = await runtime.startPrairieLearn({
    commandMode: "custom",
    baseUrl: "http://127.0.0.1:3000",
    startCommand: "docker run broken"
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /Start command exited with code 1/);
});

test("prairielearn-runtime reconnect reports missing running containers", async () => {
  const { runtime } = createRuntime({
    spawn: createSpawnStub({}),
    listPrairieLearnContainers: async () => ({ ok: true, containers: [] })
  });

  const result = await runtime.reconnectPrairieLearn({
    commandMode: "reconnect",
    baseUrl: "http://127.0.0.1:3000",
    startCommand: ""
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /No running PrairieLearn containers/);
});

test("prairielearn-runtime can cancel an in-flight start", async () => {
  const spawnState = {};
  const { runtime } = createRuntime({
    spawn: createSpawnStub(
      {
        "docker run hanging": {
          holdOpen: true
        }
      },
      spawnState
    )
  });

  const startPromise = runtime.startPrairieLearn({
    commandMode: "custom",
    baseUrl: "http://127.0.0.1:3000",
    startCommand: "docker run hanging"
  });

  await new Promise((resolve) => setImmediate(resolve));
  const stopResult = await runtime.stopPrairieLearnStart();
  assert.equal(stopResult.ok, true);

  const child = spawnState.children["docker run hanging"];
  child.emit("close", 0, null);

  const result = await startPromise;
  assert.equal(result.ok, false);
  assert.match(result.error, /stopped by user/);
});

test("prairielearn-runtime stopConnectedPrairieLearn reports when no container matches the configured port", async () => {
  const { runtime } = createRuntime({
    spawn: createSpawnStub({}),
    runShellCommand: async () => ({ ok: true, stdout: "", stderr: "", error: "" })
  });

  const result = await runtime.stopConnectedPrairieLearn("http://127.0.0.1:3000");
  assert.equal(result.ok, false);
  assert.match(result.error, /No running container found/);
});
