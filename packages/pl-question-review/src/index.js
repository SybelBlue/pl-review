const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_CONFIG = {
  stateRoot: '.automation/review_state',
  reviewedRoot: 'questions/reviewed',
  erroneousRoot: 'questions/erroneous',
  waitingRoot: 'questions/waiting',
  erroneousAssessmentSlug: 'erroneous',
  erroneousAssessmentTitle: 'Erroneous Questions',
  erroneousAssessmentNumber: 'ERR',
  waitingAssessmentSlug: 'waiting',
  waitingAssessmentTitle: 'Waiting Questions',
  waitingAssessmentNumber: 'WAIT',
  assessmentRoot: '',
};

function normalizeReviewConfig(config = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    stateRoot: String(config.stateRoot || DEFAULT_CONFIG.stateRoot),
    reviewedRoot: String(config.reviewedRoot || DEFAULT_CONFIG.reviewedRoot),
    erroneousRoot: String(config.erroneousRoot || DEFAULT_CONFIG.erroneousRoot),
    waitingRoot: String(config.waitingRoot || DEFAULT_CONFIG.waitingRoot),
    erroneousAssessmentSlug: String(config.erroneousAssessmentSlug || DEFAULT_CONFIG.erroneousAssessmentSlug),
    erroneousAssessmentTitle: String(config.erroneousAssessmentTitle || DEFAULT_CONFIG.erroneousAssessmentTitle),
    erroneousAssessmentNumber: String(config.erroneousAssessmentNumber || DEFAULT_CONFIG.erroneousAssessmentNumber),
    waitingAssessmentSlug: String(config.waitingAssessmentSlug || DEFAULT_CONFIG.waitingAssessmentSlug),
    waitingAssessmentTitle: String(config.waitingAssessmentTitle || DEFAULT_CONFIG.waitingAssessmentTitle),
    waitingAssessmentNumber: String(config.waitingAssessmentNumber || DEFAULT_CONFIG.waitingAssessmentNumber),
    assessmentRoot: String(config.assessmentRoot || DEFAULT_CONFIG.assessmentRoot),
  };
}

function createEnvironment(options = {}) {
  return {
    fs: options.fs || fs,
    path: options.path || path,
    cwd: options.cwd || process.cwd(),
    randomUUID: options.randomUUID || (() => crypto.randomUUID()),
  };
}

function resolveRepoPath(env, value) {
  return env.path.resolve(env.cwd, String(value || ''));
}

function nowIso() {
  return new Date().toISOString();
}

async function exists(filePath, env) {
  try {
    await env.fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function readJsonFile(filePath, env) {
  const raw = await env.fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJsonFile(filePath, data, env) {
  await env.fs.mkdir(env.path.dirname(filePath), { recursive: true });
  await env.fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function normalizeReviewTag(tag) {
  const trimmed = String(tag || '').trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('rv:')) {
    return trimmed === 'rv:' ? '' : trimmed;
  }
  return `rv:${trimmed}`;
}

function filterReviewTags(tags) {
  return (Array.isArray(tags) ? tags : []).filter((tag) => typeof tag === 'string' && tag.startsWith('rv:'));
}

function slugifyReviewKey(reviewKey) {
  return Buffer.from(String(reviewKey || 'review'), 'utf8')
    .toString('base64')
    .replace(/[/+=]/g, '_')
    .slice(0, 120);
}

function getStatePath(reviewKey, env, config) {
  return env.path.join(resolveRepoPath(env, config.stateRoot), `${slugifyReviewKey(reviewKey)}.json`);
}

function normalizeState(parsed = {}, reviewKey = '') {
  const decisions = parsed.decisions && typeof parsed.decisions === 'object' ? parsed.decisions : {};
  for (const decision of Object.values(decisions)) {
    if (decision && decision.status === 'rejected') {
      decision.status = 'waiting';
    }
  }

  return {
    reviewKey: parsed.reviewKey || parsed.review_key || reviewKey,
    decisions,
    history: Array.isArray(parsed.history) ? parsed.history : [],
    tagCatalog: Array.isArray(parsed.tagCatalog || parsed.tag_catalog)
      ? (parsed.tagCatalog || parsed.tag_catalog).map((tag) => String(tag))
      : [],
    createdAt: parsed.createdAt || parsed.created_at || nowIso(),
    updatedAt: parsed.updatedAt || parsed.updated_at || null,
  };
}

function computeSummary(decisions, itemIds = []) {
  const idSet = new Set((Array.isArray(itemIds) ? itemIds : []).map((value) => String(value)));
  const relevantEntries = idSet.size > 0
    ? Object.entries(decisions).filter(([itemId]) => idSet.has(itemId))
    : Object.entries(decisions);

  const approved = relevantEntries.filter(([, entry]) => entry?.status === 'approved').length;
  const waiting = relevantEntries.filter(([, entry]) => entry?.status === 'waiting').length;
  const erroneous = relevantEntries.filter(([, entry]) => entry?.status === 'erroneous').length;
  const total = idSet.size > 0 ? idSet.size : relevantEntries.length;
  const done = approved + waiting + erroneous;

  return {
    approved,
    waiting,
    erroneous,
    pending: Math.max(0, total - done),
    total,
    done,
  };
}

function normalizeItem(input = {}) {
  const item = {
    id: String(input.id || '').trim(),
    title: String(input.title || '').trim(),
    questionDir: String(input.questionDir || '').trim(),
    relpath: String(input.relpath || '').trim(),
    questionId: String(input.questionId || '').trim(),
    courseRoot: String(input.courseRoot || '').trim(),
  };

  if (!item.id) {
    throw new Error('Review item requires an id.');
  }
  if (!item.questionDir) {
    throw new Error(`Review item ${item.id} requires questionDir.`);
  }
  if (!item.relpath) {
    throw new Error(`Review item ${item.id} requires relpath.`);
  }

  return item;
}

async function loadState(reviewKey, env, config) {
  const statePath = getStatePath(reviewKey, env, config);
  if (!(await exists(statePath, env))) {
    return { statePath, state: normalizeState({}, reviewKey) };
  }
  return {
    statePath,
    state: normalizeState(await readJsonFile(statePath, env), reviewKey),
  };
}

async function saveState(statePath, state, env) {
  await writeJsonFile(
    statePath,
    {
      ...state,
      updatedAt: nowIso(),
    },
    env
  );
}

async function getQuestionTags(questionDir, env) {
  const infoPath = env.path.join(questionDir, 'info.json');
  if (!(await exists(infoPath, env))) {
    return [];
  }
  try {
    const info = await readJsonFile(infoPath, env);
    return Array.isArray(info.tags) ? info.tags.filter((tag) => typeof tag === 'string') : [];
  } catch (_error) {
    return [];
  }
}

async function setQuestionTags(questionDir, tags, env) {
  const infoPath = env.path.join(questionDir, 'info.json');
  if (!(await exists(infoPath, env))) {
    return false;
  }

  try {
    const info = await readJsonFile(infoPath, env);
    info.tags = [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))].sort();
    await writeJsonFile(infoPath, info, env);
    return true;
  } catch (_error) {
    return false;
  }
}

async function addTagToQuestionInfo(questionDir, tag, env) {
  const infoPath = env.path.join(questionDir, 'info.json');
  if (!(await exists(infoPath, env))) {
    return false;
  }

  try {
    const info = await readJsonFile(infoPath, env);
    const normalized = normalizeReviewTag(tag);
    if (!normalized) {
      return false;
    }
    const tags = Array.isArray(info.tags) ? info.tags.filter((entry) => typeof entry === 'string') : [];
    if (tags.includes(normalized)) {
      return false;
    }
    tags.push(normalized);
    info.tags = tags;
    await writeJsonFile(infoPath, info, env);
    return true;
  } catch (_error) {
    return false;
  }
}

async function regenerateQuestionUuid(questionDir, env) {
  const infoPath = env.path.join(questionDir, 'info.json');
  if (!(await exists(infoPath, env))) {
    return false;
  }
  try {
    const info = await readJsonFile(infoPath, env);
    info.uuid = env.randomUUID();
    await writeJsonFile(infoPath, info, env);
    return true;
  } catch (_error) {
    return false;
  }
}

async function copyQuestionDirectory(srcDir, destRoot, relpathValue, env) {
  const destination = env.path.join(destRoot, relpathValue);
  const destinationExists = await exists(destination, env);
  await env.fs.mkdir(env.path.dirname(destination), { recursive: true });
  await env.fs.cp(srcDir, destination, { recursive: true, force: true });
  await regenerateQuestionUuid(destination, env);
  return { destination, destinationExists };
}

async function backupFile(filePath, env) {
  const fileExists = await exists(filePath, env);
  return {
    path: filePath,
    existed: fileExists,
    content: fileExists ? await env.fs.readFile(filePath, 'utf8') : null,
  };
}

async function restoreFileBackup(backup, env) {
  const filePath = String(backup.path);
  if (backup.existed) {
    await env.fs.mkdir(env.path.dirname(filePath), { recursive: true });
    await env.fs.writeFile(filePath, String(backup.content || ''), 'utf8');
    return;
  }

  if (await exists(filePath, env)) {
    await env.fs.rm(filePath, { force: true });
    let current = env.path.dirname(filePath);
    while (current && current !== env.path.dirname(current)) {
      try {
        const entries = await env.fs.readdir(current);
        if (entries.length > 0) {
          break;
        }
        await env.fs.rmdir(current);
        current = env.path.dirname(current);
      } catch (_error) {
        break;
      }
    }
  }
}

async function ensureAssessmentInfo({
  assessmentInfoPath,
  zoneTitle,
  questionId,
  assessmentType,
  assessmentTitle,
  assessmentNumber,
  categoryLabel,
  env,
}) {
  let info;
  let changed = false;
  const backups = [];

  if (await exists(assessmentInfoPath, env)) {
    info = await readJsonFile(assessmentInfoPath, env);
  } else {
    info = {
      uuid: '00000000-0000-0000-0000-000000000000',
      type: assessmentType,
      title: assessmentTitle,
      set: 'Homework',
      module: 'QTI Banks',
      number: assessmentNumber,
      allowAccess: [],
      zones: [],
      comment: `Auto-maintained by review workflow for ${categoryLabel} questions.`,
    };
    changed = true;
  }

  const zones = Array.isArray(info.zones) ? info.zones : [];
  info.zones = zones;
  let zone = zones.find((entry) => entry && entry.title === zoneTitle);
  if (!zone) {
    zone = { title: zoneTitle, questions: [] };
    zones.push(zone);
    changed = true;
  }

  if (!Array.isArray(zone.questions)) {
    zone.questions = [];
    changed = true;
  }

  if (!zone.questions.some((entry) => entry && entry.id === questionId)) {
    zone.questions.push({ id: questionId, points: 1, maxPoints: 1 });
    changed = true;
  }

  if (changed) {
    backups.push(await backupFile(assessmentInfoPath, env));
    await writeJsonFile(assessmentInfoPath, info, env);
  }

  return { changed, backups };
}

function buildBaseResult({ reviewKey, itemId, action, state, summary, message }) {
  return {
    ok: true,
    reviewKey,
    itemId,
    action,
    stateChanged: true,
    message,
    updatedSummary: summary,
    canUndo: Array.isArray(state.history) && state.history.length > 0,
  };
}

function createReviewManager(config = {}, deps = {}) {
  const normalizedConfig = normalizeReviewConfig(config);
  const env = createEnvironment(deps);

  async function getReviewState(reviewKey) {
    const { statePath, state } = await loadState(reviewKey, env, normalizedConfig);
    return {
      ok: true,
      reviewKey,
      statePath,
      state: {
        reviewKey: state.reviewKey,
        decisions: state.decisions,
        history: state.history,
        tagCatalog: state.tagCatalog,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      },
      canUndo: state.history.length > 0,
    };
  }

  async function listReviewDecisions(reviewKey) {
    const { state } = await loadState(reviewKey, env, normalizedConfig);
    return {
      ok: true,
      reviewKey,
      decisions: state.decisions,
      canUndo: state.history.length > 0,
    };
  }

  async function getReviewSummary({ reviewKey, itemIds = [] }) {
    const { state } = await loadState(reviewKey, env, normalizedConfig);
    return {
      ok: true,
      reviewKey,
      updatedSummary: computeSummary(state.decisions, itemIds),
      canUndo: state.history.length > 0,
    };
  }

  async function setReviewTags({ reviewKey, item, tags = [], itemIds = [] }) {
    const normalizedItem = normalizeItem(item);
    const { statePath, state } = await loadState(reviewKey, env, normalizedConfig);
    const currentTags = await getQuestionTags(normalizedItem.questionDir, env);
    const requestedTags = [...new Set((Array.isArray(tags) ? tags : []).map(normalizeReviewTag).filter(Boolean))].sort();
    const nextTags = currentTags.filter((tag) => !String(tag).startsWith('rv:')).concat(requestedTags);
    const changed = await setQuestionTags(normalizedItem.questionDir, nextTags, env);

    if (changed) {
      const catalog = new Set(filterReviewTags(state.tagCatalog));
      for (const tag of requestedTags) {
        catalog.add(tag);
      }
      state.tagCatalog = [...catalog].sort();
      await saveState(statePath, state, env);
    }

    return {
      ok: true,
      reviewKey,
      itemId: normalizedItem.id,
      action: 'set-tags',
      stateChanged: changed,
      message: changed ? `Updated review tags for ${normalizedItem.title || normalizedItem.id}.` : 'No tag changes.',
      updatedSummary: computeSummary(state.decisions, itemIds),
      canUndo: state.history.length > 0,
      reviewTags: requestedTags,
    };
  }

  async function applyReviewDecision({ reviewKey, item, decision, itemIds = [] }) {
    const normalizedItem = normalizeItem(item);
    const allowed = new Set(['approve', 'approve-format', 'waiting', 'erroneous', 'skip']);
    if (!allowed.has(decision)) {
      throw new Error(`Unsupported review decision: ${decision}`);
    }

    const { statePath, state } = await loadState(reviewKey, env, normalizedConfig);
    const previousDecision = state.decisions[normalizedItem.id] || null;

    if (decision === 'skip') {
      state.history.push({
        action: 'skip',
        itemId: normalizedItem.id,
        prevDecision: previousDecision,
      });
      await saveState(statePath, state, env);
      return buildBaseResult({
        reviewKey,
        itemId: normalizedItem.id,
        action: decision,
        state,
        summary: computeSummary(state.decisions, itemIds),
        message: `Skipped ${normalizedItem.title || normalizedItem.id}.`,
      });
    }

    const destinationRoot = decision === 'waiting'
      ? normalizedConfig.waitingRoot
      : decision === 'erroneous'
        ? normalizedConfig.erroneousRoot
        : normalizedConfig.reviewedRoot;

    const copy = await copyQuestionDirectory(
      normalizedItem.questionDir,
      resolveRepoPath(env, destinationRoot),
      normalizedItem.relpath,
      env
    );

    if (decision === 'approve-format') {
      await addTagToQuestionInfo(copy.destination, 'rv:revise-format', env);
    }

    let assessmentChanged = false;
    let assessmentBackups = [];
    if (decision === 'waiting' || decision === 'erroneous') {
      const assessmentRoot = normalizedConfig.assessmentRoot || (normalizedItem.courseRoot
        ? env.path.join(normalizedItem.courseRoot, 'assessments')
        : '');
      if (assessmentRoot) {
        const assessmentInfoPath = env.path.join(
          assessmentRoot,
          decision === 'waiting' ? normalizedConfig.waitingAssessmentSlug : normalizedConfig.erroneousAssessmentSlug,
          'infoAssessment.json'
        );
        const assessment = await ensureAssessmentInfo({
          assessmentInfoPath,
          zoneTitle: normalizedItem.title || normalizedItem.relpath,
          questionId: normalizedItem.questionId,
          assessmentType: 'Homework',
          assessmentTitle: decision === 'waiting'
            ? normalizedConfig.waitingAssessmentTitle
            : normalizedConfig.erroneousAssessmentTitle,
          assessmentNumber: decision === 'waiting'
            ? normalizedConfig.waitingAssessmentNumber
            : normalizedConfig.erroneousAssessmentNumber,
          categoryLabel: decision,
          env,
        });
        assessmentChanged = assessment.changed;
        assessmentBackups = assessment.backups;
      }
    }

    state.decisions[normalizedItem.id] = {
      status: decision === 'approve' || decision === 'approve-format' ? 'approved' : decision,
      reviewedAt: nowIso(),
      source: normalizedItem.questionDir,
      copiedTo: copy.destination,
      relpath: normalizedItem.relpath,
      questionId: normalizedItem.questionId,
      title: normalizedItem.title,
      reviseFormat: decision === 'approve-format',
    };
    state.history.push({
      action: decision,
      itemId: normalizedItem.id,
      prevDecision: previousDecision,
      copiedTo: copy.destination,
      createdCopyDir: !copy.destinationExists,
      assessmentBackups,
    });
    await saveState(statePath, state, env);

    return {
      ...buildBaseResult({
        reviewKey,
        itemId: normalizedItem.id,
        action: decision,
        state,
        summary: computeSummary(state.decisions, itemIds),
        message: `${decision} applied to ${normalizedItem.title || normalizedItem.id}.`,
      }),
      decision,
      copiedTo: copy.destination,
      assessmentChanged,
    };
  }

  async function undoLastReviewAction(reviewKey, itemIds = []) {
    const { statePath, state } = await loadState(reviewKey, env, normalizedConfig);
    if (state.history.length === 0) {
      return {
        ok: true,
        reviewKey,
        itemId: '',
        action: 'undo',
        stateChanged: false,
        message: 'Nothing to undo.',
        updatedSummary: computeSummary(state.decisions, itemIds),
        canUndo: false,
      };
    }

    const entry = state.history.pop();
    if (['approve', 'approve-format', 'waiting', 'erroneous'].includes(entry.action)) {
      if (entry.prevDecision == null) {
        delete state.decisions[entry.itemId];
      } else {
        state.decisions[entry.itemId] = entry.prevDecision;
      }
    }

    if (entry.copiedTo) {
      if (entry.createdCopyDir) {
        await env.fs.rm(String(entry.copiedTo), { recursive: true, force: true });
      }
    }

    if (Array.isArray(entry.assessmentBackups)) {
      for (const backup of [...entry.assessmentBackups].reverse()) {
        await restoreFileBackup(backup, env);
      }
    }

    await saveState(statePath, state, env);
    return {
      ok: true,
      reviewKey,
      itemId: entry.itemId || '',
      action: 'undo',
      stateChanged: true,
      message: `Undid ${entry.action} for ${entry.itemId}.`,
      updatedSummary: computeSummary(state.decisions, itemIds),
      canUndo: state.history.length > 0,
    };
  }

  return {
    getReviewState,
    listReviewDecisions,
    getReviewSummary,
    setReviewTags,
    applyReviewDecision,
    undoLastReviewAction,
  };
}

module.exports = {
  DEFAULT_CONFIG,
  normalizeReviewConfig,
  createReviewManager,
  normalizeReviewTag,
  filterReviewTags,
};
