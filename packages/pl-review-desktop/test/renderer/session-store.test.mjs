import test from "node:test";
import assert from "node:assert/strict";
import { createEmptySession, getSessionKey, loadSession, saveSession, sessionPrefix } from "../../src/renderer/state/session-store.mjs";

function createStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    }
  };
}

test("session-store creates and keys empty sessions by pdf path", () => {
  const session = createEmptySession("/tmp/a.pdf");
  assert.equal(session.version, 1);
  assert.equal(session.currentPdfPage, 1);
  assert.equal(getSessionKey("/tmp/a.pdf"), `${sessionPrefix}/tmp/a.pdf`);
});

test("session-store restores corrupt or missing data safely", () => {
  const storage = createStorage();
  assert.deepEqual(loadSession(storage, "/tmp/missing.pdf"), createEmptySession("/tmp/missing.pdf"));

  storage.setItem(getSessionKey("/tmp/bad.pdf"), "{oops");
  assert.deepEqual(loadSession(storage, "/tmp/bad.pdf"), createEmptySession("/tmp/bad.pdf"));
});

test("session-store saves the current pdf page alongside session data", () => {
  const storage = createStorage();
  const pdf = { path: "/tmp/test.pdf" };
  const session = createEmptySession(pdf.path);
  session.questions.push({ id: "q1" });
  saveSession(storage, pdf, session, 4);
  const stored = JSON.parse(storage.getItem(getSessionKey(pdf.path)));
  assert.equal(stored.currentPdfPage, 4);
  assert.equal(stored.questions.length, 1);
});
