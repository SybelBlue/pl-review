let reviewPackage;
try {
  reviewPackage = require("pl-question-review");
} catch (_error) {
  reviewPackage = require("../../../pl-question-review/src/index.js");
}

const {
  loadReviewContext,
  loadBankSession,
  searchPendingQuestions,
  updateReviewTags,
  jumpToQuestion,
  applyReviewAction,
  undoLastReviewAction
} = reviewPackage;

function toReviewConfig(config = {}) {
  return {
    manifestPath: config.reviewManifestPath,
    reviewBankSlug: config.reviewBankSlug,
    stateRoot: config.reviewStateRoot,
    reviewedRoot: config.reviewReviewedRoot,
    erroneousRoot: config.reviewErroneousRoot,
    waitingRoot: config.reviewWaitingRoot,
    erroneousAssessmentSlug: config.reviewErroneousAssessmentSlug,
    erroneousAssessmentTitle: config.reviewErroneousAssessmentTitle,
    erroneousAssessmentNumber: config.reviewErroneousAssessmentNumber,
    waitingAssessmentSlug: config.reviewWaitingAssessmentSlug,
    waitingAssessmentTitle: config.reviewWaitingAssessmentTitle,
    waitingAssessmentNumber: config.reviewWaitingAssessmentNumber
  };
}

function createReviewService({ readConfig, writeConfig }) {
  async function getConfigWithBank(bankSlug = null) {
    const config = await readConfig();
    if (!bankSlug) {
      return config;
    }
    return writeConfig({
      ...config,
      reviewBankSlug: bankSlug
    });
  }

  async function loadContext() {
    const config = await readConfig();
    return loadReviewContext(toReviewConfig(config));
  }

  async function selectBank(bankSlug) {
    const config = await getConfigWithBank(bankSlug);
    return loadBankSession(toReviewConfig(config), bankSlug);
  }

  async function search(bankSlug, query) {
    const config = await getConfigWithBank(bankSlug);
    return searchPendingQuestions(toReviewConfig(config), query);
  }

  async function setTags(bankSlug, tags) {
    const config = await getConfigWithBank(bankSlug);
    return updateReviewTags(toReviewConfig(config), bankSlug, tags);
  }

  async function jump(bankSlug, questionIndex) {
    const config = await getConfigWithBank(bankSlug);
    return jumpToQuestion(toReviewConfig(config), bankSlug, questionIndex);
  }

  async function act(bankSlug, action) {
    const config = await getConfigWithBank(bankSlug);
    return applyReviewAction(toReviewConfig(config), bankSlug, action);
  }

  async function undo(bankSlug) {
    const config = await getConfigWithBank(bankSlug);
    return undoLastReviewAction(toReviewConfig(config), bankSlug);
  }

  return {
    loadContext,
    selectBank,
    search,
    setTags,
    jump,
    act,
    undo
  };
}

module.exports = {
  createReviewService,
  toReviewConfig
};
