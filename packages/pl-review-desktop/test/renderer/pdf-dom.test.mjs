import test from "node:test";
import assert from "node:assert/strict";
import { init } from "../../src/renderer/controller/init.mjs";
import { createRendererTestContext } from "./helpers.mjs";
import { getSessionKey } from "../../src/renderer/state/session-store.mjs";

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("pdf DOM toggles overlay and updates iframe source when the current page changes", async () => {
  const context = await createRendererTestContext();
  try {
    context.localStorage.setItem(
      getSessionKey("/tmp/assessment.pdf"),
      JSON.stringify({
        version: 1,
        pdfPath: "/tmp/assessment.pdf",
        currentPdfPage: 4,
        currentQuestionId: null,
        questions: []
      })
    );

    const app = await init({
      documentRef: context.document,
      windowRef: context.window,
      localStorageRef: context.localStorage,
      cryptoRef: { randomUUID: () => "uuid-1" }
    });

    assert.equal(context.document.getElementById("pdf-overlay").hidden, false);
    assert.equal(context.document.querySelector(".workspace").classList.contains("is-pdf-empty"), true);
    assert.equal(context.document.querySelector(".workspace").classList.contains("is-pdf-collapsed"), false);
    assert.equal(context.document.getElementById("pdf-column-body").hidden, false);
    assert.equal(context.document.getElementById("pdf-pane-toggle-button").getAttribute("aria-expanded"), "true");
    assert.equal(context.document.getElementById("pl-config-overlay").hidden, false);
    assert.equal(context.document.getElementById("prairielearn-view").style.visibility, "hidden");

    await app.loadPdfSelection({ path: "/tmp/assessment.pdf", name: "assessment.pdf" });
    await settle();

    assert.equal(context.document.getElementById("pdf-overlay").hidden, true);
    assert.equal(context.document.querySelector(".workspace").classList.contains("is-pdf-empty"), false);
    assert.equal(context.document.querySelector(".workspace").classList.contains("is-pdf-collapsed"), false);
    assert.equal(context.document.getElementById("pdf-column-body").hidden, false);
    assert.equal(context.document.getElementById("pdf-pane-toggle-button").getAttribute("aria-expanded"), "true");
    assert.equal(context.document.getElementById("pdf-frame").hidden, false);
    assert.match(context.document.getElementById("pdf-frame").src, /page=4/);
    assert.equal(context.document.getElementById("prairielearn-view").style.visibility, "hidden");

    app.setPdfPage(6);
    assert.match(context.document.getElementById("pdf-frame").src, /page=6/);
    assert.equal(context.document.getElementById("pdf-page-input").value, "6");

    context.document.getElementById("pdf-pane-toggle-button").click();
    assert.equal(context.document.querySelector(".workspace").classList.contains("is-pdf-collapsed"), true);
    assert.equal(context.document.getElementById("pdf-column-body").hidden, true);
    assert.equal(context.document.getElementById("pdf-pane-toggle-button").getAttribute("aria-expanded"), "false");

    context.document.getElementById("pdf-pane-toggle-button").click();
    assert.equal(context.document.querySelector(".workspace").classList.contains("is-pdf-collapsed"), false);
    assert.equal(context.document.getElementById("pdf-column-body").hidden, false);
    assert.equal(context.document.getElementById("pdf-pane-toggle-button").getAttribute("aria-expanded"), "true");
  } finally {
    context.cleanup();
  }
});
