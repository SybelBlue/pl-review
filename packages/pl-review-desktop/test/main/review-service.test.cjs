const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createReviewService, toReviewConfig } = require("../../src/main/review-service.cjs");

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pl-review-service-"));
  const questionDir = path.join(root, "questions", "review", "bank-a", "q1");
  await fs.mkdir(questionDir, { recursive: true });
  await fs.writeFile(
    path.join(questionDir, "info.json"),
    `${JSON.stringify({ title: "Question One", uuid: "old-1", tags: [] }, null, 2)}\n`
  );
  await fs.writeFile(path.join(questionDir, "question.html"), "<div>q1</div>");
  await fs.writeFile(
    path.join(root, "questions", "review", "_transpile_manifest.json"),
    `${JSON.stringify(
      {
        output_root: "questions/review",
        banks: [
          {
            bank_slug: "bank-a",
            bank_ident: "ba",
            bank_title: "Bank A",
            questions: [
              {
                question_relpath: "bank-a/q1",
                question_dir: "questions/review/bank-a/q1",
                item_ident: "item-1",
                question_slug: "q1"
              }
            ]
          }
        ]
      },
      null,
      2
    )}\n`
  );
  return root;
}

test("toReviewConfig maps desktop config into package config", () => {
  const mapped = toReviewConfig({
    reviewManifestPath: "manifest.json",
    reviewSourceType: "sidecar",
    reviewSequenceId: "sequence-1",
    reviewBankSlug: "bank-a",
    reviewStateRoot: ".state",
    reviewReviewedRoot: "reviewed",
    reviewErroneousRoot: "err",
    reviewWaitingRoot: "wait",
    reviewErroneousAssessmentSlug: "err-slug",
    reviewErroneousAssessmentTitle: "Err",
    reviewErroneousAssessmentNumber: "E1",
    reviewWaitingAssessmentSlug: "wait-slug",
    reviewWaitingAssessmentTitle: "Wait",
    reviewWaitingAssessmentNumber: "W1"
  });

  assert.equal(mapped.manifestPath, "manifest.json");
  assert.equal(mapped.sourceType, "sidecar");
  assert.equal(mapped.sequenceId, "sequence-1");
  assert.equal(mapped.reviewBankSlug, "bank-a");
  assert.equal(mapped.waitingAssessmentNumber, "W1");
});

test("review-service loads context and persists selected bank", async () => {
  const root = await makeFixture();
  let savedConfig = {
    reviewManifestPath: path.join(root, "questions", "review", "_transpile_manifest.json"),
    reviewSourceType: "manifest",
    reviewSequenceId: "",
    reviewBankSlug: "",
    reviewStateRoot: path.join(root, ".automation", "review_state"),
    reviewReviewedRoot: path.join(root, "questions", "reviewed"),
    reviewErroneousRoot: path.join(root, "questions", "erroneous"),
    reviewWaitingRoot: path.join(root, "questions", "waiting"),
    reviewErroneousAssessmentSlug: "erroneous",
    reviewErroneousAssessmentTitle: "Erroneous Questions",
    reviewErroneousAssessmentNumber: "ERR",
    reviewWaitingAssessmentSlug: "waiting",
    reviewWaitingAssessmentTitle: "Waiting Questions",
    reviewWaitingAssessmentNumber: "WAIT"
  };

  const service = createReviewService({
    readConfig: async () => savedConfig,
    writeConfig: async (config) => {
      savedConfig = { ...config };
      return savedConfig;
    },
    fs,
    path
  });

  const context = await service.loadContext();
  assert.equal(context.banks.length, 1);

  const selected = await service.selectBank("bank-a");
  assert.equal(selected.currentBankSlug, "bank-a");
  assert.equal(savedConfig.reviewBankSlug, "bank-a");
});

test("review-service prefers live sidecar sequence and resolves local question dirs from course directories", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pl-review-live-"));
  const courseRoot = path.join(root, "course");
  const questionDir = path.join(courseRoot, "questions", "topic", "q1");
  await fs.mkdir(questionDir, { recursive: true });
  await fs.writeFile(
    path.join(questionDir, "info.json"),
    `${JSON.stringify({ qid: "Q1", title: "Question One", uuid: "old-1", tags: ["topic"] }, null, 2)}\n`
  );
  await fs.writeFile(path.join(questionDir, "question.html"), "<div>q1</div>");

  const service = createReviewService({
    readConfig: async () => ({
      reviewManifestPath: "",
      reviewSourceType: "sidecar",
      reviewSequenceId: "index-assessment:http___localhost",
      reviewBankSlug: "",
      reviewStateRoot: path.join(root, ".automation", "review_state"),
      reviewReviewedRoot: path.join(root, "questions", "reviewed"),
      reviewErroneousRoot: path.join(root, "questions", "erroneous"),
      reviewWaitingRoot: path.join(root, "questions", "waiting"),
      reviewErroneousAssessmentSlug: "erroneous",
      reviewErroneousAssessmentTitle: "Erroneous Questions",
      reviewErroneousAssessmentNumber: "ERR",
      reviewWaitingAssessmentSlug: "waiting",
      reviewWaitingAssessmentTitle: "Waiting Questions",
      reviewWaitingAssessmentNumber: "WAIT",
      courseDirectories: [courseRoot]
    }),
    writeConfig: async (config) => config,
    sidecar: {
      async getIndexedQuestionSequence() {
        return {
          sequenceId: "index-assessment:http___localhost",
          title: "Current PrairieLearn sequence",
          questions: [{ id: "Q1", qid: "Q1", title: "Question One", link: "http://localhost/question/1", tags: [] }],
          currentIndex: 0,
          url: "http://localhost/question/1"
        };
      }
    },
    fs,
    path
  });

  const context = await service.loadContext();
  assert.equal(context.sourceType, "sidecar");
  assert.equal(context.currentSequenceId, "index-assessment:http___localhost");
  assert.equal(context.session.currentItem.resolutionStatus, "resolved");
  assert.match(context.session.currentItem.questionDir, /course\/questions\/topic\/q1$/);
});
