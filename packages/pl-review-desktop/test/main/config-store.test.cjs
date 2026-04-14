const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_CONFIG, createConfigStore, normalizeConfig } = require("../../src/main/config-store.cjs");

test("config-store normalizes legacy config into custom mode", () => {
  const normalized = normalizeConfig({
    baseUrl: "http://example.test",
    startCommand: "docker run example"
  });

  assert.equal(normalized.commandMode, "custom");
  assert.equal(normalized.customStartCommand, "docker run example");
  assert.equal(normalized.autoLoadFromDiskOnConnect, true);
});

test("config-store reads defaults and writes normalized config", async () => {
  const writes = [];
  const store = createConfigStore({
    app: {
      getPath() {
        return "/tmp/pl-review";
      }
    },
    path: require("node:path"),
    fs: {
      async readFile() {
        throw new Error("missing");
      },
      async mkdir() {},
      async writeFile(filePath, content) {
        writes.push({ filePath, content });
      }
    }
  });

  assert.deepEqual(await store.readConfig(), DEFAULT_CONFIG);
  const written = await store.writeConfig({ commandMode: "custom", customStartCommand: "docker run x" });
  assert.equal(written.commandMode, "custom");
  assert.match(writes[0].filePath, /settings\.json$/);
  assert.match(writes[0].content, /docker run x/);
});
