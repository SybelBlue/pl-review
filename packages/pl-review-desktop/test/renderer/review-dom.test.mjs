import test from "node:test";
import assert from "node:assert/strict";
import { init } from "../../src/renderer/controller/init.mjs";
import { createRendererTestContext } from "./helpers.mjs";

function makeSnapshot({
  relpath = "bank-a/q1",
  title = "Question One",
  reviewTags = ["rv:checked"],
  currentSequenceId = "sidecar:bank-a",
  directoryEntries = [{ index: 0, pendingIndex: 1, relpath: "bank-a/q1", title: "Question One", skipped: false }],
  summary = { approved: 0, waiting: 0, erroneous: 0, pending: 1, total: 1, done: 0 }
} = {}) {
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
      cursor: 0,
      canUndo: true,
      finished: false,
      currentIndex: 0,
      totalQuestions: 1,
      currentItem: {
        relpath,
        title,
        reviewTags,
        reviewFiles: ["/tmp/question.html"]
      },
      directoryEntries,
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
          reviewTags: [],
          directoryEntries: [{ index: 1, pendingIndex: 1, relpath: "bank-a/q2", title: "Question Two", skipped: false }],
          summary: { approved: 1, waiting: 0, erroneous: 0, pending: 1, total: 2, done: 1 }
        });
        return { message: "Approved, copied, and advanced: /tmp/q1", snapshot };
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

    context.document.getElementById("review-approve-button").click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.match(context.document.getElementById("review-status").textContent, /Approved, copied, and advanced/);
    assert.match(context.document.getElementById("review-current-title").textContent, /Question Two/);
    assert.match(context.document.getElementById("review-summary").textContent, /approved=1/);
  } finally {
    context.cleanup();
  }
});
