let reviewPackage;
try {
  reviewPackage = require("pl-question-review");
} catch (_error) {
  reviewPackage = require("../../../pl-question-review/src/index.js");
}

const {
  loadReviewContext,
  loadBankSession,
  buildSequenceSnapshot,
  searchSequenceItems,
  updateSequenceReviewTags,
  jumpToSequenceItem,
  applySequenceReviewAction,
  undoLastSequenceReviewAction,
  searchPendingQuestions,
  updateReviewTags,
  jumpToQuestion,
  applyReviewAction,
  undoLastReviewAction
} = reviewPackage;

function toReviewConfig(config = {}) {
  return {
    manifestPath: config.reviewManifestPath,
    sourceType: config.reviewSourceType,
    sequenceId: config.reviewSequenceId,
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

function createReviewService({ readConfig, writeConfig, sidecar, fs, path }) {
  const resolutionCache = new Map();

  async function getConfigWithSelection(selection = {}) {
    const config = await readConfig();
    const nextConfig = {
      ...config,
      ...(selection.sourceType ? { reviewSourceType: selection.sourceType } : {}),
      ...(selection.sequenceId !== undefined ? { reviewSequenceId: selection.sequenceId } : {}),
      ...(selection.bankSlug !== undefined ? { reviewBankSlug: selection.bankSlug } : {})
    };
    if (
      nextConfig.reviewSourceType === config.reviewSourceType &&
      nextConfig.reviewSequenceId === config.reviewSequenceId &&
      nextConfig.reviewBankSlug === config.reviewBankSlug
    ) {
      return config;
    }
    return writeConfig(nextConfig);
  }

  async function getLiveSequence() {
    if (!sidecar || typeof sidecar.getIndexedQuestionSequence !== "function") {
      return null;
    }

    try {
      const sequence = await sidecar.getIndexedQuestionSequence();
      if (!sequence || !Array.isArray(sequence.questions) || sequence.questions.length === 0) {
        return null;
      }

      return {
        sourceType: "sidecar",
        sequenceId: sequence.sequenceId,
        sequenceTitle: sequence.title || "Current PrairieLearn sequence",
        items: sequence.questions.map((question, index) => ({
          id: question.id || question.qid || question.link || `question-${index + 1}`,
          qid: question.qid || "",
          title: question.title || question.qid || `Question ${index + 1}`,
          topic: question.topic || "",
          tags: Array.isArray(question.tags) ? question.tags : [],
          link: question.link || "",
          index
        })),
        currentIndex: sequence.currentIndex,
        url: sequence.url
      };
    } catch (_error) {
      return null;
    }
  }

  function getCourseDirectories(config) {
    const many = Array.isArray(config.courseDirectories) ? config.courseDirectories : [];
    const legacy = config.courseDirectory ? [config.courseDirectory] : [];
    return [...new Set([...many, ...legacy].map((value) => String(value || "").trim()).filter(Boolean))];
  }

  async function scanQuestionInfoFiles(rootDir) {
    const infoFiles = [];
    const queue = [path.join(rootDir, "questions")];

    while (queue.length > 0) {
      const current = queue.shift();
      let entries = [];
      try {
        entries = await fs.readdir(current, { withFileTypes: true });
      } catch (_error) {
        continue;
      }

      for (const entry of entries) {
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(absolute);
        } else if (entry.isFile() && entry.name === "info.json") {
          infoFiles.push(absolute);
        }
      }
    }

    return infoFiles;
  }

  async function getResolutionIndex(courseRoot) {
    if (resolutionCache.has(courseRoot)) {
      return resolutionCache.get(courseRoot);
    }

    const infoFiles = await scanQuestionInfoFiles(courseRoot);
    const index = {
      byQid: new Map(),
      byTitle: new Map()
    };

    for (const infoPath of infoFiles) {
      try {
        const parsed = JSON.parse(await fs.readFile(infoPath, "utf8"));
        const questionDir = path.dirname(infoPath);
        const relpath = path.relative(path.join(courseRoot, "questions"), questionDir).replaceAll(path.sep, "/");
        const entry = {
          courseRoot,
          questionDir,
          relpath,
          questionId: relpath,
          qid: String(parsed.qid || ""),
          title: String(parsed.title || "")
        };

        if (entry.qid) {
          index.byQid.set(entry.qid, entry);
        }
        if (entry.title && !index.byTitle.has(entry.title)) {
          index.byTitle.set(entry.title, entry);
        }
      } catch (_error) {
        continue;
      }
    }

    resolutionCache.set(courseRoot, index);
    return index;
  }

  async function resolveItem(item) {
    const config = await readConfig();
    const courseDirectories = getCourseDirectories(config);

    for (const courseRoot of courseDirectories) {
      const index = await getResolutionIndex(courseRoot);
      if (item.qid && index.byQid.has(item.qid)) {
        return index.byQid.get(item.qid);
      }
    }

    for (const courseRoot of courseDirectories) {
      const index = await getResolutionIndex(courseRoot);
      if (item.title && index.byTitle.has(item.title)) {
        return index.byTitle.get(item.title);
      }
    }

    return null;
  }

  function withAliases(snapshot) {
    if (!snapshot) {
      return snapshot;
    }
    return {
      ...snapshot,
      banks: snapshot.banks || snapshot.sequences || [],
      currentBankSlug: snapshot.currentBankSlug || snapshot.currentSequenceId || ""
    };
  }

  async function loadManifestFallback(config) {
    if (!config.reviewManifestPath) {
      return withAliases({
        config: toReviewConfig(config),
        sourceType: "sidecar",
        sequences: [],
        currentSequenceId: "",
        session: null
      });
    }

    const snapshot = config.reviewBankSlug
      ? await loadBankSession(toReviewConfig(config), config.reviewBankSlug)
      : await loadReviewContext(toReviewConfig(config));
    return withAliases({
      ...snapshot,
      sourceType: "manifest",
      sequences: (snapshot.banks || []).map((bank) => ({
        sequenceId: bank.bankSlug,
        sequenceTitle: bank.bankTitle,
        totalItems: bank.totalQuestions,
        summary: bank.summary
      })),
      currentSequenceId: snapshot.currentBankSlug || "",
      session: snapshot.session
        ? {
            ...snapshot.session,
            sequenceId: snapshot.session.bankSlug,
            sequenceTitle: snapshot.session.bankTitle
          }
        : null
    });
  }

  async function loadContext() {
    const config = await readConfig();
    const liveSequence = await getLiveSequence();
    if (config.reviewSourceType !== "manifest" && liveSequence) {
      const snapshot = await buildSequenceSnapshot(toReviewConfig(config), liveSequence, { resolveItem });
      return withAliases(snapshot);
    }
    return loadManifestFallback(config);
  }

  async function selectBank(bankSlug) {
    const config = await getConfigWithSelection({ sourceType: "manifest", bankSlug, sequenceId: "" });
    return loadManifestFallback(config);
  }

  async function selectSequence(sequenceId) {
    const liveSequence = await getLiveSequence();
    const config = await getConfigWithSelection({ sourceType: liveSequence ? "sidecar" : "manifest", sequenceId, bankSlug: "" });
    if (liveSequence && liveSequence.sequenceId === sequenceId) {
      return withAliases(await buildSequenceSnapshot(toReviewConfig(config), liveSequence, { resolveItem }));
    }
    return loadManifestFallback(config);
  }

  async function search(bankSlug, query) {
    const config = await readConfig();
    const liveSequence = await getLiveSequence();
    if (config.reviewSourceType !== "manifest" && liveSequence) {
      return searchSequenceItems(toReviewConfig(config), liveSequence, query, { resolveItem });
    }
    return searchPendingQuestions(toReviewConfig(config), query);
  }

  async function setTags(bankSlug, tags) {
    const config = await readConfig();
    const liveSequence = await getLiveSequence();
    if (config.reviewSourceType !== "manifest" && liveSequence) {
      return withAliases(await updateSequenceReviewTags(toReviewConfig(config), liveSequence, tags, { resolveItem }));
    }
    return withAliases(await updateReviewTags(toReviewConfig(config), bankSlug, tags));
  }

  async function jump(bankSlug, questionIndex) {
    const config = await readConfig();
    const liveSequence = await getLiveSequence();
    if (config.reviewSourceType !== "manifest" && liveSequence) {
      return withAliases(await jumpToSequenceItem(toReviewConfig(config), liveSequence, questionIndex, { resolveItem }));
    }
    return withAliases(await jumpToQuestion(toReviewConfig(config), bankSlug, questionIndex));
  }

  async function act(bankSlug, action) {
    const config = await readConfig();
    const liveSequence = await getLiveSequence();
    if (config.reviewSourceType !== "manifest" && liveSequence) {
      const result = await applySequenceReviewAction(toReviewConfig(config), liveSequence, action, { resolveItem });
      return { ...result, snapshot: withAliases(result.snapshot) };
    }
    return applyReviewAction(toReviewConfig(config), bankSlug, action);
  }

  async function undo(bankSlug) {
    const config = await readConfig();
    const liveSequence = await getLiveSequence();
    if (config.reviewSourceType !== "manifest" && liveSequence) {
      const result = await undoLastSequenceReviewAction(toReviewConfig(config), liveSequence, { resolveItem });
      return { ...result, snapshot: withAliases(result.snapshot) };
    }
    return undoLastReviewAction(toReviewConfig(config), bankSlug);
  }

  return {
    loadContext,
    selectBank,
    selectSequence,
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
