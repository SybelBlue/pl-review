import test from "node:test";
import assert from "node:assert/strict";
import { ansiCodesToClass, escapeHtml, formatDockerLogHtml } from "../../src/renderer/services/docker-log-format.mjs";

test("docker-log-format escapes html and maps ansi classes", () => {
  assert.equal(escapeHtml("<tag>&"), "&lt;tag&gt;&amp;");
  assert.equal(ansiCodesToClass(["1", "31"]), "ansi-bold ansi-fg-1 ansi-fg-default");
});

test("docker-log-format wraps ansi spans deterministically", () => {
  const html = formatDockerLogHtml("\u001b[31mError\u001b[0m");
  assert.match(html, /ansi-fg-1/);
  assert.match(html, /Error/);
});
