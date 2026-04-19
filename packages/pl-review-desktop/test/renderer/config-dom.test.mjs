import test from "node:test";
import assert from "node:assert/strict";
import { init } from "../../src/renderer/controller/init.mjs";
import { createRendererTestContext } from "./helpers.mjs";

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("config DOM unlocks editors and switches command modes", async () => {
  const context = await createRendererTestContext();
  try {
    await init({
      documentRef: context.document,
      windowRef: context.window,
      localStorageRef: context.localStorage,
      cryptoRef: { randomUUID: () => "uuid-1" }
    });
    await settle();

    assert.equal(context.document.getElementById("connection-step-content").getAttribute("aria-disabled"), "false");
    assert.equal(context.document.getElementById("add-course-directory-button").disabled, false);

    const customRadio = context.document.getElementById("command-mode-custom");
    customRadio.checked = true;
    customRadio.dispatchEvent(new context.window.Event("change", { bubbles: true }));
    assert.equal(context.document.getElementById("custom-command-editor").classList.contains("is-inactive"), false);

    const reconnectRadio = context.document.getElementById("command-mode-reconnect");
    reconnectRadio.checked = true;
    reconnectRadio.dispatchEvent(new context.window.Event("change", { bubbles: true }));
    await settle();
    assert.equal(context.document.getElementById("refresh-running-containers-button").disabled, false);
  } finally {
    context.cleanup();
  }
});

test("config DOM still initializes if the current-url label is missing", async () => {
  const context = await createRendererTestContext();
  try {
    context.document.getElementById("current-url").remove();

    await init({
      documentRef: context.document,
      windowRef: context.window,
      localStorageRef: context.localStorage,
      cryptoRef: { randomUUID: () => "uuid-1" }
    });
    await settle();

    assert.equal(context.document.getElementById("pl-config-overlay").hidden, false);
  } finally {
    context.cleanup();
  }
});

test("config DOM adds, removes, and reorders course rows while updating preview", async () => {
  const context = await createRendererTestContext();
  try {
    const app = await init({
      documentRef: context.document,
      windowRef: context.window,
      localStorageRef: context.localStorage,
      cryptoRef: { randomUUID: () => "uuid-1" }
    });
    await settle();

    context.document.getElementById("add-course-directory-button").click();
    const inputs = context.document.querySelectorAll("[data-course-directory-input]");
    inputs[0].value = "/repo/a";
    inputs[0].dispatchEvent(new context.window.Event("input", { bubbles: true }));
    inputs[1].value = "/repo/b";
    inputs[1].dispatchEvent(new context.window.Event("input", { bubbles: true }));
    assert.match(context.document.getElementById("generated-command-preview").value, /\/course2/);

    const excludeCheckboxes = context.document.querySelectorAll("[data-course-directory-exclude]");
    excludeCheckboxes[1].checked = false;
    excludeCheckboxes[1].dispatchEvent(new context.window.Event("change", { bubbles: true }));
    assert.equal(context.document.querySelectorAll(".course-directory-mount")[1].textContent, "Excluded");
    assert.match(context.document.getElementById("generated-command-preview").value, /-v '\/repo\/a':\/course/);
    assert.doesNotMatch(context.document.getElementById("generated-command-preview").value, /\/repo\/b/);

    const rows = context.document.querySelectorAll(".course-directory-row");
    const dragStart = new context.window.Event("dragstart", { bubbles: true });
    Object.defineProperty(dragStart, "dataTransfer", { value: { effectAllowed: "" } });
    rows[0].dispatchEvent(dragStart);
    const drop = new context.window.Event("drop", { bubbles: true });
    Object.defineProperty(drop, "dataTransfer", { value: {} });
    rows[1].dispatchEvent(drop);

    const reordered = context.document.querySelectorAll("[data-course-directory-input]");
    assert.equal(reordered[0].value, "/repo/b");

    context.document.querySelector("[data-course-remove]").click();
    assert.equal(context.document.querySelectorAll(".course-directory-row").length, 1);
    assert.ok(app);
  } finally {
    context.cleanup();
  }
});
