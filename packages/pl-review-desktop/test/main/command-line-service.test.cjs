const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createCommandLineService } = require("../../src/main/command-line-service.cjs");

function createSpawnStub(results) {
  return (command) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
    };

    process.nextTick(() => {
      const result = results[command] || { code: 0 };
      if (result.error) {
        child.emit("error", new Error(result.error));
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

test("command-line-service reports dependency states across installed and warning scenarios", async (t) => {
  await t.test("all present", async () => {
    const service = createCommandLineService({
      spawn: createSpawnStub({
        "docker --version": { stdout: "Docker version 27.0.0" },
        "git --version": { stdout: "git version 2.0.0" },
        "gh --version": { stdout: "gh version 2.0.0" },
        "gh auth status": { stdout: "Logged in" }
      })
    });
    const result = await service.checkCommandLineDependencies();
    assert.equal(result.ok, true);
    assert.deepEqual(result.warnings, []);
  });

  await t.test("missing docker", async () => {
    const service = createCommandLineService({
      spawn: createSpawnStub({
        "docker --version": { code: 1, stderr: "missing docker" },
        "git --version": { stdout: "git version 2.0.0" },
        "gh --version": { stdout: "gh version 2.0.0" },
        "gh auth status": { stdout: "Logged in" }
      })
    });
    const result = await service.checkCommandLineDependencies();
    assert.equal(result.ok, false);
    assert.equal(result.docker.ok, false);
  });

  await t.test("missing git", async () => {
    const service = createCommandLineService({
      spawn: createSpawnStub({
        "docker --version": { stdout: "Docker version 27.0.0" },
        "git --version": { code: 1, stderr: "missing git" },
        "gh --version": { stdout: "gh version 2.0.0" },
        "gh auth status": { stdout: "Logged in" }
      })
    });
    const result = await service.checkCommandLineDependencies();
    assert.equal(result.ok, false);
    assert.equal(result.git.ok, false);
  });

  await t.test("missing gh", async () => {
    const service = createCommandLineService({
      spawn: createSpawnStub({
        "docker --version": { stdout: "Docker version 27.0.0" },
        "git --version": { stdout: "git version 2.0.0" },
        "gh --version": { code: 1, stderr: "missing gh" }
      })
    });
    const result = await service.checkCommandLineDependencies();
    assert.equal(result.ok, true);
    assert.match(result.warnings.join(" "), /not installed/);
  });

  await t.test("unauthenticated gh", async () => {
    const service = createCommandLineService({
      spawn: createSpawnStub({
        "docker --version": { stdout: "Docker version 27.0.0" },
        "git --version": { stdout: "git version 2.0.0" },
        "gh --version": { stdout: "gh version 2.0.0" },
        "gh auth status": { code: 1, stderr: "not logged in" }
      })
    });
    const result = await service.checkCommandLineDependencies();
    assert.equal(result.ok, true);
    assert.match(result.warnings.join(" "), /not authenticated/);
  });
});

test("command-line-service parses Docker Desktop status and PrairieLearn containers", async () => {
  const service = createCommandLineService({
    spawn: createSpawnStub({
      "docker desktop status --format json": {
        stdout: "noise\n{\"Status\":\"running\"}\n"
      }
    })
  });

  const status = await service.getDockerDesktopStatus();
  assert.deepEqual(status, { ok: true, status: "running" });

  const containers = service.parsePrairieLearnContainers(
    "abc\tprairielearn/prairielearn:latest\t3000/tcp\tUp 1 minute\tpl-review\nzzz\tnginx\t80/tcp\tUp 2 minutes\tnginx"
  );
  assert.equal(containers.length, 1);
  assert.equal(containers[0].id, "abc");
});
