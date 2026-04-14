import test from "node:test";
import assert from "node:assert/strict";
import { init } from "../../src/renderer/controller/init.mjs";
import { createRendererTestContext } from "./helpers.mjs";
import { getSessionKey } from "../../src/renderer/state/session-store.mjs";

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("questions DOM renders stored questions and preserves selection while editing", async () => {
  const context = await createRendererTestContext();
  try {
    context.localStorage.setItem(
      getSessionKey("/tmp/assessment.pdf"),
      JSON.stringify({
        version: 1,
        pdfPath: "/tmp/assessment.pdf",
        currentPdfPage: 3,
        currentQuestionId: "q1",
        questions: [
          {
            id: "q1",
            label: "Question 1",
            prairielearnPath: "/pl/course/1",
            pdfPage: 3,
            tags: "translation",
            notes: "",
            flagged: true
          },
          {
            id: "q2",
            label: "Question 2",
            prairielearnPath: "",
            pdfPage: 5,
            tags: "",
            notes: "",
            flagged: false
          }
        ]
      })
    );

    const app = await init({
      documentRef: context.document,
      windowRef: context.window,
      localStorageRef: context.localStorage,
      cryptoRef: { randomUUID: () => "uuid-1" }
    });
    await app.loadPdfSelection({ path: "/tmp/assessment.pdf", name: "assessment.pdf" });
    await settle();

    const items = context.document.querySelectorAll(".question-item");
    assert.equal(items.length, 2);
    assert.equal(items[0].classList.contains("is-active"), true);
    assert.match(items[0].querySelector(".question-item-meta").textContent, /Flagged/);

    const titleInput = context.document.getElementById("question-title-input");
    titleInput.value = "Edited Title";
    titleInput.dispatchEvent(new context.window.Event("input", { bubbles: true }));

    assert.equal(context.document.querySelector(".question-item.is-active .question-item-title").textContent, "Edited Title");
  } finally {
    context.cleanup();
  }
});
