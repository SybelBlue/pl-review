import test from "node:test";
import assert from "node:assert/strict";
import { init } from "../../src/renderer/controller/init.mjs";
import { createRendererTestContext } from "./helpers.mjs";

function makeSnapshot({
  relpath = "bank-a/q1",
  title = "Question One",
  reviewTags = ["rv:checked"],
  link = "http://localhost/question/1",
  currentSequenceId = "sidecar:bank-a",
  directoryEntries = [{ index: 0, pendingIndex: 1, relpath: "bank-a/q1", title: "Question One", skipped: false }],
  sequenceEntries = [{ index: 0, itemId: "item-1", relpath: "bank-a/q1", title: "Question One", decision: null, isCurrent: true }],
  summary = { approved: 0, waiting: 0, erroneous: 0, pending: 1, total: 1, done: 0 }
} = {}) {
  const currentSequenceEntry = sequenceEntries.find((entry) => entry.isCurrent) || sequenceEntries[0] || null;
  return {
    sourceType: "sidecar",
    config: {
      manifestPath: "questions/review/_transpile_manifest.json",
      stateRoot: ".automation/review_state",
      reviewedRoot: "questions/reviewed",
      erroneousRoot: "questions/erroneous",
      waitingRoot: "questions/waiting",
      erroneousAssessmentSlug: "erroneous",
      erroneousAssessmentTitle: "Erroneous Questions",
      erroneousAssessmentNumber: "ERR",
      waitingAssessmentSlug: "waiting",
      waitingAssessmentTitle: "Waiting Questions",
      waitingAssessmentNumber: "WAIT"
    },
    sequences: [{ sequenceId: currentSequenceId, sequenceTitle: "Current PrairieLearn sequence", summary }],
    currentSequenceId,
    session: {
      sequenceId: currentSequenceId,
      sequenceTitle: "Current PrairieLearn sequence",
      statePath: "/tmp/bank-a.json",
      summary,
      cursor: currentSequenceEntry?.index || 0,
      canUndo: true,
      finished: false,
      currentIndex: currentSequenceEntry?.index || 0,
      totalQuestions: sequenceEntries.length,
      currentItem: {
        itemId: currentSequenceEntry?.itemId || "item-1",
        relpath,
        title,
        link,
        reviewTags,
        reviewFiles: ["/tmp/question.html"]
      },
      directoryEntries,
      sequenceEntries,
      tagCatalog: reviewTags
    }
  };
}

test("review DOM loads bank context and applies review actions", async () => {
  let snapshot = makeSnapshot();
  const context = await createRendererTestContext({
    reviewApi: {
      loadReviewContext: async () => snapshot,
      selectReviewSequence: async () => snapshot,
      searchReviewQuestions: async () => snapshot.session.directoryEntries,
      updateReviewTags: async (_bankSlug, tags) => {
        snapshot = makeSnapshot({ reviewTags: tags.map((tag) => (tag.startsWith("rv:") ? tag : `rv:${tag}`)) });
        return snapshot;
      },
      applyReviewAction: async () => {
        snapshot = makeSnapshot({
          relpath: "bank-a/q2",
          title: "Question Two",
          link: "http://localhost/question/2",
          reviewTags: [],
          directoryEntries: [{ index: 1, pendingIndex: 1, relpath: "bank-a/q2", title: "Question Two", skipped: false }],
          sequenceEntries: [
            { index: 0, itemId: "item-1", relpath: "bank-a/q1", title: "Question One", decision: "approve", isCurrent: false },
            { index: 1, itemId: "item-2", relpath: "bank-a/q2", title: "Question Two", decision: null, isCurrent: true }
          ],
          summary: { approved: 1, waiting: 0, erroneous: 0, pending: 1, total: 2, done: 1 }
        });
        return { message: "Approved, copied, and advanced: /tmp/q1", snapshot };
      },
      jumpToReviewQuestion: async (_sequenceId, questionIndex) => {
        snapshot = makeSnapshot({
          relpath: questionIndex === 0 ? "bank-a/q1" : "bank-a/q2",
          title: questionIndex === 0 ? "Question One" : "Question Two",
          link: `http://localhost/question/${questionIndex + 1}`,
          reviewTags: questionIndex === 0 ? ["rv:checked"] : [],
          directoryEntries: [{ index: questionIndex, pendingIndex: 1, relpath: `bank-a/q${questionIndex + 1}`, title: `Question ${questionIndex + 1}`, skipped: false }],
          sequenceEntries: [
            { index: 0, itemId: "item-1", relpath: "bank-a/q1", title: "Question One", decision: null, isCurrent: questionIndex === 0 },
            { index: 1, itemId: "item-2", relpath: "bank-a/q2", title: "Question Two", decision: null, isCurrent: questionIndex === 1 }
          ],
          summary: { approved: 0, waiting: 0, erroneous: 0, pending: 2, total: 2, done: 0 }
        });
        return snapshot;
      }
    }
  });

  try {
    await init({
      documentRef: context.document,
      windowRef: context.window,
      localStorageRef: context.localStorage,
      cryptoRef: { randomUUID: () => "uuid-1" }
    });

    assert.equal(context.document.getElementById("review-bank-select").value, "sidecar:bank-a");
    assert.match(context.document.getElementById("review-current-title").textContent, /Question One/);

    const tagInput = context.document.getElementById("review-tag-input");
    tagInput.value = "checked, needs-format";
    context.document.getElementById("review-save-tags-button").click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.match(context.document.getElementById("review-current-tags").textContent, /rv:checked/);
    assert.match(context.document.getElementById("review-current-tags").textContent, /rv:needs-format/);
    assert.equal(context.document.getElementById("review-tag-popover").hidden, true);

    context.window.document.dispatchEvent(new context.window.KeyboardEvent("keydown", { key: "t", bubbles: true }));
    assert.equal(context.document.getElementById("review-tag-popover").hidden, false);

    context.window.document.dispatchEvent(new context.window.KeyboardEvent("keydown", { key: "a", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.match(context.document.getElementById("review-status").textContent, /Approved, copied, and advanced/);
    assert.match(context.document.getElementById("review-current-title").textContent, /Question Two/);
    assert.match(context.document.getElementById("review-summary").textContent, /approved=1/);
    assert.equal(context.document.getElementById("review-sequence-list").querySelectorAll(".question-item").length, 2);
    assert.match(context.document.getElementById("review-sequence-position").textContent, /2 of 2/);
    assert.match(context.document.getElementById("prairielearn-view").src, /question\/2/);

    context.window.document.dispatchEvent(new context.window.KeyboardEvent("keydown", { key: "[", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.match(context.document.getElementById("review-current-title").textContent, /Question One/);
    assert.match(context.document.getElementById("prairielearn-view").src, /question\/1/);
  } finally {
    context.cleanup();
  }
});
