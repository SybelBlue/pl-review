let reviewPackage;
let manifestAdapter;
try {
  reviewPackage = require("pl-question-review");
  manifestAdapter = require("pl-question-review/src/manifest-adapter.js");
} catch (_error) {
  reviewPackage = require("../../../pl-question-review/src/index.js");
  manifestAdapter = require("../../../pl-question-review/src/manifest-adapter.js");
}

const { createReviewManager } = reviewPackage;
const { loadManifestReviewSource, resolveManifestBankItems } = manifestAdapter;

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
    waitingAssessmentNumber: config.reviewWaitingAssessmentNumber,
    assessmentRoot: config.reviewAssessmentRoot || ""
  };
}

function createReviewService({ readConfig, writeConfig, sidecar, fs, path }) {
  const resolutionCache = new Map();
  const sequenceSelection = new Map();

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

  function createManager(config) {
    return createReviewManager(toReviewConfig(config));
  }

  function getReviewKey(sourceType, sequenceId) {
    return `${sourceType}:${sequenceId}`;
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
          questionDir,
          relpath,
          questionId: relpath,
          courseRoot,
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

  async function resolveLiveItem(item, config) {
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

  async function getLiveSequence(config) {
    if (!sidecar || typeof sidecar.getIndexedQuestionSequence !== "function") {
      return null;
    }

    try {
      const sequence = await sidecar.getIndexedQuestionSequence();
      if (!sequence || !Array.isArray(sequence.questions) || sequence.questions.length === 0) {
        return null;
      }

      const items = [];
      for (let index = 0; index < sequence.questions.length; index += 1) {
        const question = sequence.questions[index];
        const resolved = await resolveLiveItem(question, config);
        items.push({
          id: question.id || question.qid || question.link || `question-${index + 1}`,
          qid: question.qid || "",
          title: question.title || question.qid || `Question ${index + 1}`,
          topic: question.topic || "",
          tags: Array.isArray(question.tags) ? question.tags : [],
          link: question.link || "",
          index,
          resolutionStatus: resolved ? "resolved" : "unresolved",
          questionDir: resolved?.questionDir || "",
          relpath: resolved?.relpath || (question.qid || question.id || question.link || ""),
          questionId: resolved?.questionId || "",
          courseRoot: resolved?.courseRoot || ""
        });
      }

      return {
        sourceType: "sidecar",
        sequenceId: sequence.sequenceId,
        sequenceTitle: sequence.title || "Current PrairieLearn sequence",
        preferredIndex: Number.isInteger(sequence.currentIndex) ? sequence.currentIndex : 0,
        items
      };
    } catch (_error) {
      return null;
    }
  }

  async function getManifestSource(config) {
    if (!config.reviewManifestPath) {
      return {
        sourceType: "manifest",
        sequences: [],
        activeSequence: null
      };
    }

    let source;
    try {
      source = await loadManifestReviewSource(
        { ...toReviewConfig(config), manifestPath: config.reviewManifestPath },
        {}
      );
    } catch (error) {
      if (error?.code === "ENOENT") {
        return {
          sourceType: "manifest",
          sequences: [],
          activeSequence: null
        };
      }
      throw error;
    }
    const selectedId = config.reviewSequenceId || config.reviewBankSlug || source.banks[0]?.bankSlug || "";
    const activeSequence = selectedId
      ? await resolveManifestBankItems(
          { ...toReviewConfig(config), manifestPath: config.reviewManifestPath },
          selectedId,
          {}
        )
      : null;

    return {
      sourceType: "manifest",
      sequences: source.banks.map((bank) => ({
        sequenceId: bank.bankSlug,
        sequenceTitle: bank.bankTitle,
        itemCount: bank.itemCount,
      })),
      activeSequence: activeSequence
        ? {
            sourceType: "manifest",
            sequenceId: activeSequence.sequenceId,
            sequenceTitle: activeSequence.sequenceTitle,
            preferredIndex: 0,
            items: activeSequence.items.map((item, index) => ({
              ...item,
              qid: "",
              topic: "",
              tags: [],
              link: "",
              index,
              resolutionStatus: "resolved",
            })),
          }
        : null
    };
  }

  async function readCurrentItemDetails(item, decisions) {
    if (!item) {
      return null;
    }

    let reviewTags = [];
    let reviewFiles = [];
    if (item.questionDir) {
      try {
        const info = JSON.parse(await fs.readFile(path.join(item.questionDir, "info.json"), "utf8"));
        reviewTags = Array.isArray(info.tags) ? info.tags.filter((tag) => typeof tag === "string" && tag.startsWith("rv:")) : [];
      } catch (_error) {
        reviewTags = [];
      }
      reviewFiles = ["server.py", "source_snapshot.json", "question.html"].map((name) => path.join(item.questionDir, name));
    }

    return {
      itemId: item.id,
      qid: item.qid || "",
      title: item.title || "",
      topic: item.topic || "",
      link: item.link || "",
      relpath: item.relpath || "",
      questionDir: item.questionDir || "",
      resolutionStatus: item.resolutionStatus || (item.questionDir ? "resolved" : "unresolved"),
      reviewTags,
      reviewFiles,
      decision: decisions[item.id] || null,
    };
  }

  function selectDefaultItemId(sequence, decisions, preferredIndex) {
    if (!sequence || !Array.isArray(sequence.items) || sequence.items.length === 0) {
      return "";
    }

    const pendingIndex = sequence.items.findIndex((item) => !decisions[item.id]);
    if (Number.isInteger(preferredIndex) && preferredIndex >= 0 && preferredIndex < sequence.items.length) {
      return sequence.items[preferredIndex].id;
    }
    if (pendingIndex >= 0) {
      return sequence.items[pendingIndex].id;
    }
    return sequence.items[0].id;
  }

  function getDirectoryEntries(sequence, decisions, query = "") {
    const normalizedQuery = String(query || "").trim().toLowerCase();
    let pendingCounter = 0;

    return sequence.items
      .filter((item) => !decisions[item.id])
      .filter((item) => {
        if (!normalizedQuery) {
          return true;
        }
        return [item.id, item.qid, item.title, item.relpath, item.topic]
          .join("\n")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .map((item) => {
        pendingCounter += 1;
        return {
          index: item.index,
          itemId: item.id,
          relpath: item.relpath || item.id,
          title: item.title || item.id,
          qid: item.qid || "",
          pendingIndex: pendingCounter,
          skipped: false,
        };
      });
  }

  function getSequenceEntries(sequence, decisions, selectedItemId) {
    return sequence.items.map((item) => ({
      index: item.index,
      itemId: item.id,
      relpath: item.relpath || item.id,
      title: item.title || item.id,
      qid: item.qid || "",
      decision: decisions[item.id] || null,
      isCurrent: item.id === selectedItemId,
    }));
  }

  async function buildContext(config, sequence, allSequences, query = "") {
    const manager = createManager(config);
    const reviewKey = getReviewKey(sequence.sourceType, sequence.sequenceId);
    const decisionsResult = await manager.listReviewDecisions(reviewKey);
    const summaryResult = await manager.getReviewSummary({
      reviewKey,
      itemIds: sequence.items.map((item) => item.id),
    });
    const decisions = decisionsResult.decisions;
    const selectedItemId = sequenceSelection.get(sequence.sequenceId) || selectDefaultItemId(sequence, decisions, sequence.preferredIndex);
    const selectedItem = sequence.items.find((item) => item.id === selectedItemId) || null;
    const currentItem = await readCurrentItemDetails(selectedItem, decisions);
    const currentIndex = selectedItem ? sequence.items.findIndex((item) => item.id === selectedItem.id) : -1;
    sequenceSelection.set(sequence.sequenceId, selectedItem?.id || "");

    const sequences = [];
    for (const seq of allSequences) {
      const seqItemIds = Array.isArray(seq.items) ? seq.items.map((item) => item.id) : [];
      const seqSummary = seqItemIds.length > 0
        ? (await manager.getReviewSummary({
            reviewKey: getReviewKey(seq.sourceType, seq.sequenceId),
            itemIds: seqItemIds,
          })).updatedSummary
        : {
            approved: 0,
            waiting: 0,
            erroneous: 0,
            pending: seq.itemCount || 0,
            total: seq.itemCount || 0,
            done: 0,
          };
      sequences.push({
        sequenceId: seq.sequenceId,
        sequenceTitle: seq.sequenceTitle,
        summary: seqSummary,
      });
    }

    const context = {
      config: {
        manifestPath: config.reviewManifestPath,
        stateRoot: config.reviewStateRoot,
        reviewedRoot: config.reviewReviewedRoot,
        erroneousRoot: config.reviewErroneousRoot,
        waitingRoot: config.reviewWaitingRoot,
        erroneousAssessmentSlug: config.reviewErroneousAssessmentSlug,
        erroneousAssessmentTitle: config.reviewErroneousAssessmentTitle,
        erroneousAssessmentNumber: config.reviewErroneousAssessmentNumber,
        waitingAssessmentSlug: config.reviewWaitingAssessmentSlug,
        waitingAssessmentTitle: config.reviewWaitingAssessmentTitle,
        waitingAssessmentNumber: config.reviewWaitingAssessmentNumber,
      },
      sourceType: sequence.sourceType,
      sequences,
      currentSequenceId: sequence.sequenceId,
      session: {
        sequenceId: sequence.sequenceId,
        sequenceTitle: sequence.sequenceTitle,
        reviewKey,
        summary: summaryResult.updatedSummary,
        canUndo: decisionsResult.canUndo,
        finished: sequence.items.every((item) => decisions[item.id]),
        currentIndex,
        totalQuestions: sequence.items.length,
        currentItem,
        directoryEntries: getDirectoryEntries(sequence, decisions, query),
        sequenceEntries: getSequenceEntries(sequence, decisions, selectedItem?.id || ""),
      },
    };

    return withAliases(context);
  }

  function withAliases(context) {
    if (!context) {
      return context;
    }

    return {
      ...context,
      banks: context.sequences || [],
      currentBankSlug: context.currentSequenceId || "",
      session: context.session
        ? {
            ...context.session,
            bankSlug: context.session.sequenceId,
            bankTitle: context.session.sequenceTitle,
          }
        : null,
    };
  }

  async function getSourceContext(config, preferredSequenceId = "") {
    const liveSequence = config.reviewSourceType !== "manifest" ? await getLiveSequence(config) : null;
    if (liveSequence) {
      return {
        sourceType: "sidecar",
        sequences: [liveSequence],
        activeSequence: liveSequence,
      };
    }

    const manifestSource = await getManifestSource({
      ...config,
      reviewSequenceId: preferredSequenceId || config.reviewSequenceId || config.reviewBankSlug || "",
    });

    return {
      sourceType: "manifest",
      sequences: manifestSource.activeSequence
        ? manifestSource.sequences.map((entry) => ({
            ...entry,
            sourceType: "manifest",
            items: entry.sequenceId === manifestSource.activeSequence.sequenceId ? manifestSource.activeSequence.items : [],
          }))
        : manifestSource.sequences.map((entry) => ({
            ...entry,
            sourceType: "manifest",
            items: [],
          })),
      activeSequence: manifestSource.activeSequence,
    };
  }

  async function loadContext() {
    const config = await readConfig();
    const source = await getSourceContext(config);
    if (!source.activeSequence) {
      return withAliases({
        config: {
          manifestPath: config.reviewManifestPath,
          stateRoot: config.reviewStateRoot,
          reviewedRoot: config.reviewReviewedRoot,
          erroneousRoot: config.reviewErroneousRoot,
          waitingRoot: config.reviewWaitingRoot,
          erroneousAssessmentSlug: config.reviewErroneousAssessmentSlug,
          erroneousAssessmentTitle: config.reviewErroneousAssessmentTitle,
          erroneousAssessmentNumber: config.reviewErroneousAssessmentNumber,
          waitingAssessmentSlug: config.reviewWaitingAssessmentSlug,
          waitingAssessmentTitle: config.reviewWaitingAssessmentTitle,
          waitingAssessmentNumber: config.reviewWaitingAssessmentNumber,
        },
        sourceType: source.sourceType,
        sequences: source.sequences.map((sequence) => ({
          sequenceId: sequence.sequenceId,
          sequenceTitle: sequence.sequenceTitle,
          summary: {
            approved: 0,
            waiting: 0,
            erroneous: 0,
            pending: sequence.itemCount || 0,
            total: sequence.itemCount || 0,
            done: 0,
          },
        })),
        currentSequenceId: "",
        session: null,
      });
    }

    return buildContext(config, source.activeSequence, source.sequences.length > 0 ? source.sequences : [source.activeSequence]);
  }

  async function selectSequence(sequenceId) {
    const currentConfig = await readConfig();
    const liveSequence = await getLiveSequence(currentConfig);
    const config = await getConfigWithSelection({
      sourceType: liveSequence && liveSequence.sequenceId === sequenceId ? "sidecar" : "manifest",
      sequenceId,
      bankSlug: ""
    });
    if (liveSequence && liveSequence.sequenceId === sequenceId) {
      sequenceSelection.set(sequenceId, liveSequence.items[liveSequence.preferredIndex]?.id || "");
      return buildContext(config, liveSequence, [liveSequence]);
    }

    const manifest = await getManifestSource({ ...config, reviewSequenceId: sequenceId });
    if (!manifest.activeSequence) {
      return loadContext();
    }
    sequenceSelection.set(sequenceId, manifest.activeSequence.items[0]?.id || "");
    return buildContext(config, manifest.activeSequence, manifest.sequences);
  }

  async function selectBank(bankSlug) {
    const config = await getConfigWithSelection({
      sourceType: "manifest",
      sequenceId: bankSlug,
      bankSlug,
    });
    const manifest = await getManifestSource({ ...config, reviewSequenceId: bankSlug, reviewBankSlug: bankSlug });
    if (!manifest.activeSequence) {
      return loadContext();
    }
    sequenceSelection.set(bankSlug, manifest.activeSequence.items[0]?.id || "");
    return buildContext(config, manifest.activeSequence, manifest.sequences);
  }

  async function search(sequenceId, query) {
    const config = await readConfig();
    const source = await getSourceContext({ ...config, reviewSequenceId: sequenceId });
    if (!source.activeSequence) {
      return [];
    }
    const manager = createManager(config);
    const reviewKey = getReviewKey(source.activeSequence.sourceType, source.activeSequence.sequenceId);
    const decisions = (await manager.listReviewDecisions(reviewKey)).decisions;
    return getDirectoryEntries(source.activeSequence, decisions, query);
  }

  async function jump(sequenceId, questionIndex) {
    const config = await readConfig();
    const source = await getSourceContext({ ...config, reviewSequenceId: sequenceId });
    if (!source.activeSequence) {
      return loadContext();
    }
    const item = source.activeSequence.items[Number(questionIndex)] || source.activeSequence.items[0];
    sequenceSelection.set(sequenceId, item?.id || "");
    return buildContext(config, source.activeSequence, source.sequences.length > 0 ? source.sequences : [source.activeSequence]);
  }

  async function setTags(sequenceId, tags) {
    const config = await readConfig();
    const source = await getSourceContext({ ...config, reviewSequenceId: sequenceId });
    if (!source.activeSequence) {
      throw new Error("No review sequence is available.");
    }

    const manager = createManager(config);
    const reviewKey = getReviewKey(source.activeSequence.sourceType, source.activeSequence.sequenceId);
    const decisions = (await manager.listReviewDecisions(reviewKey)).decisions;
    const selectedItemId = sequenceSelection.get(sequenceId) || selectDefaultItemId(source.activeSequence, decisions, source.activeSequence.preferredIndex);
    const selectedItem = source.activeSequence.items.find((item) => item.id === selectedItemId);
    if (!selectedItem) {
      throw new Error("No current review item is selected.");
    }

    await manager.setReviewTags({
      reviewKey,
      item: selectedItem,
      tags,
      itemIds: source.activeSequence.items.map((item) => item.id),
    });

    return buildContext(config, source.activeSequence, source.sequences.length > 0 ? source.sequences : [source.activeSequence]);
  }

  async function act(sequenceId, action) {
    const config = await readConfig();
    const source = await getSourceContext({ ...config, reviewSequenceId: sequenceId });
    if (!source.activeSequence) {
      throw new Error("No review sequence is available.");
    }

    const manager = createManager(config);
    const reviewKey = getReviewKey(source.activeSequence.sourceType, source.activeSequence.sequenceId);
    const decisions = (await manager.listReviewDecisions(reviewKey)).decisions;
    const currentId = sequenceSelection.get(sequenceId) || selectDefaultItemId(source.activeSequence, decisions, source.activeSequence.preferredIndex);
    const currentIndex = source.activeSequence.items.findIndex((item) => item.id === currentId);
    const selectedItem = source.activeSequence.items[currentIndex];
    if (!selectedItem) {
      throw new Error("No current review item is selected.");
    }

    const result = await manager.applyReviewDecision({
      reviewKey,
      item: selectedItem,
      decision: action,
      itemIds: source.activeSequence.items.map((item) => item.id),
    });

    if (action !== "skip") {
      const latestDecisions = (await manager.listReviewDecisions(reviewKey)).decisions;
      const nextPending = source.activeSequence.items.find((item) => !latestDecisions[item.id]);
      sequenceSelection.set(sequenceId, nextPending?.id || selectedItem.id);
    }

    return {
      ...result,
      snapshot: await buildContext(config, source.activeSequence, source.sequences.length > 0 ? source.sequences : [source.activeSequence]),
    };
  }

  async function undo(sequenceId) {
    const config = await readConfig();
    const source = await getSourceContext({ ...config, reviewSequenceId: sequenceId });
    if (!source.activeSequence) {
      throw new Error("No review sequence is available.");
    }

    const manager = createManager(config);
    const reviewKey = getReviewKey(source.activeSequence.sourceType, source.activeSequence.sequenceId);
    const result = await manager.undoLastReviewAction(reviewKey, source.activeSequence.items.map((item) => item.id));
    if (result.itemId) {
      sequenceSelection.set(sequenceId, result.itemId);
    }

    return {
      ...result,
      snapshot: await buildContext(config, source.activeSequence, source.sequences.length > 0 ? source.sequences : [source.activeSequence]),
    };
  }

  return {
    loadContext,
    selectBank,
    selectSequence,
    search,
    setTags,
    jump,
    act,
    undo,
  };
}

module.exports = {
  createReviewService,
  toReviewConfig,
};
