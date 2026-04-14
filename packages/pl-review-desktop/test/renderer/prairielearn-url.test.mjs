import test from "node:test";
import assert from "node:assert/strict";
import { getRelativePrairieLearnPath, resolvePrairieLearnUrl } from "../../src/renderer/services/prairielearn-url.mjs";

test("prairielearn-url resolves relative and absolute urls", () => {
  assert.equal(
    resolvePrairieLearnUrl("/pl/course/1", "http://127.0.0.1:3000"),
    "http://127.0.0.1:3000/pl/course/1"
  );
  assert.equal(
    resolvePrairieLearnUrl("https://example.test/path", "http://127.0.0.1:3000"),
    "https://example.test/path"
  );
});

test("prairielearn-url preserves off-origin paths and shortens on-origin urls", () => {
  assert.equal(
    getRelativePrairieLearnPath("http://127.0.0.1:3000/pl/course/1?mode=edit", "http://127.0.0.1:3000"),
    "/pl/course/1?mode=edit"
  );
  assert.equal(
    getRelativePrairieLearnPath("https://elsewhere.test/pl/course/1", "http://127.0.0.1:3000"),
    "https://elsewhere.test/pl/course/1"
  );
});
