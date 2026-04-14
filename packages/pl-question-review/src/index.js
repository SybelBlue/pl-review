const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_CONFIG = {
  manifestPath: 'questions/review/_transpile_manifest.json',
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
};

function normalizeReviewConfig(config = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    manifestPath: String(config.manifestPath || DEFAULT_CONFIG.manifestPath),
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

function nowIso() {
  return new Date().toISOString();
}

function resolveRepoPath(env, value) {
  return env.path.resolve(env.cwd, String(value || ''));
}

async function readJsonFile(filePath, env) {
  const raw = await env.fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJsonFile(filePath, data, env) {
  await env.fs.mkdir(env.path.dirname(filePath), { recursive: true });
  await env.fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function exists(filePath, env) {
  try {
    await env.fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function loadManifest(config, options = {}) {
  const env = createEnvironment(options);
  const normalized = normalizeReviewConfig(config);
  const manifestPath = resolveRepoPath(env, normalized.manifestPath);
  const manifest = await readJsonFile(manifestPath, env);
  return { manifest, manifestPath, config: normalized, env };
}

function parseBank(manifest, bankKey, env) {
  const banks = Array.isArray(manifest.banks) ? manifest.banks : [];
  const bank = banks.find((entry) => entry.bank_slug === bankKey || entry.bank_ident === bankKey);

  if (!bank) {
    const available = banks.map((entry) => entry.bank_slug).filter(Boolean).sort();
    throw new Error(`Bank "${bankKey}" not found in manifest. Available bank slugs: ${available.join(', ')}`);
  }

  return {
    bankSlug: bank.bank_slug,
    bankIdent: bank.bank_ident || '',
    bankTitle: bank.bank_title || bank.bank_slug,
    questions: Array.isArray(bank.questions)
      ? bank.questions.map((question) => ({
          relpath: question.question_relpath,
          questionDir: env.path.resolve(env.cwd, String(question.question_dir)),
          itemIdent: question.item_ident || '',
          questionSlug: question.question_slug || '',
        }))
      : [],
  };
}

async function loadState(statePath, env) {
  if (!(await exists(statePath, env))) {
    return { cursor: 0, decisions: {}, history: [], tagCatalog: [], createdAt: nowIso() };
  }

  const parsed = await readJsonFile(statePath, env);
  const decisions = parsed.decisions && typeof parsed.decisions === 'object' ? parsed.decisions : {};
  for (const decision of Object.values(decisions)) {
    if (decision && decision.status === 'rejected') {
      decision.status = 'waiting';
    }
  }

  return {
    cursor: Number(parsed.cursor) || 0,
    decisions,
    history: Array.isArray(parsed.history) ? parsed.history : [],
    tagCatalog: Array.isArray(parsed.tagCatalog || parsed.tag_catalog)
      ? (parsed.tagCatalog || parsed.tag_catalog).map((tag) => String(tag))
      : [],
    createdAt: parsed.createdAt || parsed.created_at || nowIso(),
    updatedAt: parsed.updatedAt || parsed.updated_at || null,
    bankSlug: parsed.bankSlug || parsed.bank_slug || '',
    bankIdent: parsed.bankIdent || parsed.bank_ident || '',
    manifest: parsed.manifest || '',
  };
}

async function saveState(statePath, state, env) {
  const payload = {
    ...state,
    updatedAt: nowIso(),
  };
  await writeJsonFile(statePath, payload, env);
}

function firstUnreviewedIndex(start, questions, decisions) {
  const count = questions.length;
  if (count === 0) {
    return null;
  }
  const safeStart = Math.max(0, Math.min(start, count));
  for (let index = safeStart; index < count; index += 1) {
    if (!decisions[questions[index].relpath]) {
      return index;
    }
  }
  for (let index = 0; index < safeStart; index += 1) {
    if (!decisions[questions[index].relpath]) {
      return index;
    }
  }
  return null;
}

function remainingQuestionIndices(questions, decisions) {
  return questions.reduce((indices, question, index) => {
    if (!decisions[question.relpath]) {
      indices.push(index);
    }
    return indices;
  }, []);
}

async function readTitle(questionDir, env) {
  const infoPath = env.path.join(questionDir, 'info.json');
  if (!(await exists(infoPath, env))) {
    return '(no title)';
  }

  try {
    const info = await readJsonFile(infoPath, env);
    return String(info.title || '(no title)');
  } catch (_error) {
    return '(bad info.json)';
  }
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

function reviewFilePaths(questionDir, env) {
  return ['server.py', 'source_snapshot.json', 'question.html'].map((name) => env.path.join(questionDir, name));
}

async function copyQuestionDirectory(srcDir, destRoot, relpathValue, env) {
  const destination = env.path.join(destRoot, relpathValue);
  const destinationExists = await exists(destination, env);
  await env.fs.mkdir(env.path.dirname(destination), { recursive: true });
  await env.fs.cp(srcDir, destination, { recursive: true, force: true });
  await regenerateQuestionUuid(destination, env);
  return { destination, destinationExists };
}

function inferQuestionIdPrefix(outputRoot, env) {
  const resolvedParts = env.path.resolve(outputRoot).split(env.path.sep);
  const index = resolvedParts.indexOf('questions');
  if (index === -1) {
    return null;
  }
  const relParts = resolvedParts.slice(index + 1);
  const rel = relParts.join('/').replace(/^\/+|\/+$/g, '');
  return rel || null;
}

function computeQuestionId(manifest, relpathValue, env) {
  const outputRoot = String(manifest.output_root || 'questions/review');
  const prefix = inferQuestionIdPrefix(resolveRepoPath(env, outputRoot), env);
  const rel = String(relpathValue || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
  return prefix ? `${prefix}/${rel}` : rel;
}

function bankAssessmentPathFromManifest(manifest, bankSlug, env) {
  const assessments = Array.isArray(manifest.assessments) ? manifest.assessments : [];
  const assessment = assessments.find((entry) => entry.bank_slug === bankSlug && entry.info_assessment_path);
  return assessment ? resolveRepoPath(env, assessment.info_assessment_path) : null;
}

function ensureQuestionInAssessment(info, { zoneTitle, questionId }) {
  const zones = Array.isArray(info.zones) ? info.zones : [];
  info.zones = zones;
  let zone = zones.find((entry) => entry && entry.title === zoneTitle);
  if (!zone) {
    zone = { title: zoneTitle, questions: [] };
    zones.push(zone);
  }
  if (!Array.isArray(zone.questions)) {
    zone.questions = [];
  }
  const existsAlready = zone.questions.some((entry) => entry && entry.id === questionId);
  if (existsAlready) {
    return false;
  }
  zone.questions.push({ id: questionId, points: 1, maxPoints: 1 });
  return true;
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
  bankTitle,
  questionId,
  setName,
  moduleName,
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
      set: setName,
      module: moduleName,
      number: assessmentNumber,
      allowAccess: [],
      zones: [],
      comment: `Auto-maintained by review workflow for ${categoryLabel} questions.`,
    };
    changed = true;
  }

  if (ensureQuestionInAssessment(info, { zoneTitle: bankTitle, questionId })) {
    changed = true;
  }

  if (changed) {
    backups.push(await backupFile(assessmentInfoPath, env));
    await writeJsonFile(assessmentInfoPath, info, env);
  }

  return { changed, backups };
}

async function applyAssessmentUpdate(kind, { manifest, bank, relpathValue, config, env }) {
  if (!manifest.assessment_root) {
    return { changed: false, backups: [], message: 'No assessment root in manifest; skipped assessment updates.' };
  }

  const assessmentRoot = resolveRepoPath(env, manifest.assessment_root);
  const questionId = computeQuestionId(manifest, relpathValue, env);
  const assessmentSourcePath = bankAssessmentPathFromManifest(manifest, bank.bankSlug, env);

  let templateSet = 'Homework';
  let templateModule = 'QTI Banks';
  let templateType = 'Homework';

  if (assessmentSourcePath && (await exists(assessmentSourcePath, env))) {
    const template = await readJsonFile(assessmentSourcePath, env);
    templateSet = String(template.set || templateSet);
    templateModule = String(template.module || templateModule);
    templateType = String(template.type || templateType);
  }

  const targetInfoPath =
    kind === 'waiting'
      ? env.path.join(assessmentRoot, config.waitingAssessmentSlug, 'infoAssessment.json')
      : env.path.join(assessmentRoot, config.erroneousAssessmentSlug, 'infoAssessment.json');

  const result = await ensureAssessmentInfo({
    assessmentInfoPath: targetInfoPath,
    bankTitle: bank.bankTitle || bank.bankSlug,
    questionId,
    setName: templateSet,
    moduleName: templateModule,
    assessmentType: templateType,
    assessmentTitle: kind === 'waiting' ? config.waitingAssessmentTitle : config.erroneousAssessmentTitle,
    assessmentNumber: kind === 'waiting' ? config.waitingAssessmentNumber : config.erroneousAssessmentNumber,
    categoryLabel: kind,
    env,
  });

  return {
    changed: result.changed,
    backups: result.backups,
    message: result.changed
      ? `Updated ${kind} assessment for question (${questionId}).`
      : 'No assessment changes were needed.',
  };
}

function getReviewStatusSummary(bank, decisions) {
  const approved = Object.values(decisions).filter((entry) => entry?.status === 'approved').length;
  const waiting = Object.values(decisions).filter((entry) => entry?.status === 'waiting').length;
  const erroneous = Object.values(decisions).filter((entry) => entry?.status === 'erroneous').length;
  const total = bank.questions.length;
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

async function buildReviewSnapshot(config, bankSlug, options = {}) {
  const { manifest, manifestPath, env } = await loadManifest(config, options);
  const bank = bankSlug ? parseBank(manifest, bankSlug, env) : null;
  const normalized = normalizeReviewConfig(config);
  const banks = await Promise.all(
    (Array.isArray(manifest.banks) ? manifest.banks : []).map(async (entry) => {
      const parsedBank = parseBank(manifest, entry.bank_slug, env);
      const statePath = env.path.join(resolveRepoPath(env, normalized.stateRoot), `${parsedBank.bankSlug}.json`);
      const state = await loadState(statePath, env);
      const summary = getReviewStatusSummary(parsedBank, state.decisions);
      return {
        bankSlug: parsedBank.bankSlug,
        bankIdent: parsedBank.bankIdent,
        bankTitle: parsedBank.bankTitle,
        totalQuestions: parsedBank.questions.length,
        summary,
      };
    })
  );

  if (!bank) {
    return {
      config: normalized,
      manifestPath,
      banks,
      currentBankSlug: '',
      session: null,
    };
  }

  const stateRootPath = resolveRepoPath(env, normalized.stateRoot);
  const statePath = env.path.join(stateRootPath, `${bank.bankSlug}.json`);
  const state = await loadState(statePath, env);
  state.bankSlug = bank.bankSlug;
  state.bankIdent = bank.bankIdent;
  state.manifest = manifestPath;
  await saveState(statePath, state, env);

  const currentIndex = firstUnreviewedIndex(state.cursor, bank.questions, state.decisions);
  const currentQuestion = currentIndex === null ? null : bank.questions[currentIndex];
  const currentTitle = currentQuestion ? await readTitle(currentQuestion.questionDir, env) : '';
  const currentTags = currentQuestion ? await getQuestionTags(currentQuestion.questionDir, env) : [];
  const directoryEntries = await searchPendingQuestions(
    { manifest, bank, state, config: normalized },
    '',
    options
  );

  return {
    config: normalized,
    manifestPath,
    banks,
    currentBankSlug: bank.bankSlug,
    session: {
      bankSlug: bank.bankSlug,
      bankTitle: bank.bankTitle,
      statePath,
      summary: getReviewStatusSummary(bank, state.decisions),
      cursor: state.cursor,
      canUndo: state.history.length > 0,
      finished: currentIndex === null,
      currentIndex,
      totalQuestions: bank.questions.length,
      currentItem: currentQuestion
        ? {
            relpath: currentQuestion.relpath,
            itemIdent: currentQuestion.itemIdent,
            questionSlug: currentQuestion.questionSlug,
            questionDir: currentQuestion.questionDir,
            title: currentTitle,
            reviewFiles: reviewFilePaths(currentQuestion.questionDir, env),
            tags: currentTags,
            reviewTags: filterReviewTags(currentTags),
            decision: state.decisions[currentQuestion.relpath] || null,
          }
        : null,
      directoryEntries,
      tagCatalog: [...new Set(filterReviewTags(state.tagCatalog).concat(filterReviewTags(currentTags)))].sort(),
    },
  };
}

async function loadReviewContext(config, options = {}) {
  return buildReviewSnapshot(config, config.bankSlug || config.reviewBankSlug || '', options);
}

async function loadBankSession(config, bankSlug, options = {}) {
  return buildReviewSnapshot(config, bankSlug, options);
}

async function searchPendingQuestions(input, query = '', options = {}) {
  let manifest = input.manifest;
  let bank = input.bank;
  let state = input.state;
  const env = createEnvironment(options);

  if (!manifest || !bank || !state) {
    const { manifest: loadedManifest } = await loadManifest(input, options);
    const selectedBank = parseBank(loadedManifest, input.bankSlug || input.reviewBankSlug, env);
    const normalized = normalizeReviewConfig(input);
    const statePath = env.path.join(resolveRepoPath(env, normalized.stateRoot), `${selectedBank.bankSlug}.json`);
    const loadedState = await loadState(statePath, env);
    manifest = loadedManifest;
    bank = selectedBank;
    state = loadedState;
  }

  const pending = remainingQuestionIndices(bank.questions, state.decisions);
  const titles = new Map();
  await Promise.all(
    pending.map(async (index) => {
      titles.set(index, await readTitle(bank.questions[index].questionDir, env));
    })
  );

  const normalizedQuery = String(query || '').trim().toLowerCase();
  return pending
    .filter((index, position) => {
      if (!normalizedQuery) {
        return true;
      }
      const question = bank.questions[index];
      const title = String(titles.get(index) || '').toLowerCase();
      const values = [
        question.relpath,
        title,
        question.questionSlug,
        question.itemIdent,
        String(index + 1),
        String(position + 1),
      ]
        .join('\n')
        .toLowerCase();
      return values.includes(normalizedQuery);
    })
    .map((index, position) => ({
      index,
      relpath: bank.questions[index].relpath,
      title: titles.get(index) || '(no title)',
      questionSlug: bank.questions[index].questionSlug,
      itemIdent: bank.questions[index].itemIdent,
      pendingIndex: position + 1,
      skipped: index < state.cursor,
    }));
}

async function updateReviewTags(config, bankSlug, tags, options = {}) {
  const { manifest, env } = await loadManifest(config, options);
  const bank = parseBank(manifest, bankSlug, env);
  const normalized = normalizeReviewConfig(config);
  const statePath = env.path.join(resolveRepoPath(env, normalized.stateRoot), `${bank.bankSlug}.json`);
  const state = await loadState(statePath, env);
  const currentIndex = firstUnreviewedIndex(state.cursor, bank.questions, state.decisions);
  if (currentIndex === null) {
    return buildReviewSnapshot(config, bankSlug, options);
  }

  const question = bank.questions[currentIndex];
  const currentTags = await getQuestionTags(question.questionDir, env);
  const requestedTags = [...new Set((Array.isArray(tags) ? tags : []).map(normalizeReviewTag).filter(Boolean))].sort();
  const nextTags = currentTags.filter((tag) => !String(tag).startsWith('rv:')).concat(requestedTags);
  await setQuestionTags(question.questionDir, nextTags, env);
  const catalog = new Set(filterReviewTags(state.tagCatalog));
  for (const tag of requestedTags) {
    catalog.add(tag);
  }
  state.tagCatalog = [...catalog].sort();
  await saveState(statePath, state, env);
  return buildReviewSnapshot(config, bankSlug, options);
}

async function jumpToQuestion(config, bankSlug, questionIndex, options = {}) {
  const { manifest, env } = await loadManifest(config, options);
  const bank = parseBank(manifest, bankSlug, env);
  const normalized = normalizeReviewConfig(config);
  const statePath = env.path.join(resolveRepoPath(env, normalized.stateRoot), `${bank.bankSlug}.json`);
  const state = await loadState(statePath, env);
  state.cursor = Math.max(0, Math.min(Number(questionIndex) || 0, Math.max(0, bank.questions.length - 1)));
  await saveState(statePath, state, env);
  return buildReviewSnapshot(config, bankSlug, options);
}

async function undoLastReviewAction(config, bankSlug, options = {}) {
  const { manifest, env } = await loadManifest(config, options);
  const bank = parseBank(manifest, bankSlug, env);
  const normalized = normalizeReviewConfig(config);
  const statePath = env.path.join(resolveRepoPath(env, normalized.stateRoot), `${bank.bankSlug}.json`);
  const state = await loadState(statePath, env);
  const history = Array.isArray(state.history) ? state.history : [];

  if (history.length === 0) {
    return {
      message: 'Nothing to undo.',
      snapshot: await buildReviewSnapshot(config, bankSlug, options),
    };
  }

  const entry = history.pop();
  const decisions = state.decisions || {};
  const relpathValue = String(entry.relpath || '');
  const action = String(entry.action || '');
  state.cursor = Number(entry.cursorBefore) || 0;

  if (['approve', 'approve-format', 'waiting', 'erroneous'].includes(action)) {
    if (entry.prevDecision == null) {
      delete decisions[relpathValue];
    } else {
      decisions[relpathValue] = entry.prevDecision;
    }
  }

  let warning = '';
  if (['approve', 'approve-format', 'waiting', 'erroneous'].includes(action) && entry.copiedTo) {
    if (entry.createdCopyDir) {
      await env.fs.rm(String(entry.copiedTo), { recursive: true, force: true });
    } else if (await exists(String(entry.copiedTo), env)) {
      warning = ` Decision/cursor restored, but copied files at ${entry.copiedTo} were merged into an existing directory.`;
    }
  }

  if (['waiting', 'erroneous'].includes(action) && Array.isArray(entry.assessmentBackups)) {
    for (const backup of [...entry.assessmentBackups].reverse()) {
      await restoreFileBackup(backup, env);
    }
  }

  state.history = history;
  await saveState(statePath, state, env);

  return {
    message: `Undid ${action} for ${relpathValue}.${warning}`,
    snapshot: await buildReviewSnapshot(config, bankSlug, options),
  };
}

async function applyReviewAction(config, bankSlug, action, options = {}) {
  const { manifest, env } = await loadManifest(config, options);
  const bank = parseBank(manifest, bankSlug, env);
  const normalized = normalizeReviewConfig(config);
  const statePath = env.path.join(resolveRepoPath(env, normalized.stateRoot), `${bank.bankSlug}.json`);
  const state = await loadState(statePath, env);
  const currentIndex = firstUnreviewedIndex(state.cursor, bank.questions, state.decisions);
  if (currentIndex === null) {
    return {
      message: 'All questions in this bank are reviewed.',
      snapshot: await buildReviewSnapshot(config, bankSlug, options),
    };
  }

  const question = bank.questions[currentIndex];
  const previousDecision = state.decisions[question.relpath] || null;
  let message = '';

  if (action === 'skip') {
    state.history.push({
      action: 'skip',
      relpath: question.relpath,
      cursorBefore: currentIndex,
    });
    state.cursor = currentIndex + 1;
    await saveState(statePath, state, env);
    return {
      message: `Skipped ${question.relpath}.`,
      snapshot: await buildReviewSnapshot(config, bankSlug, options),
    };
  }

  if (action === 'approve' || action === 'approve-format') {
    const targetRoot = resolveRepoPath(env, normalized.reviewedRoot);
    const copy = await copyQuestionDirectory(question.questionDir, targetRoot, question.relpath, env);
    if (action === 'approve-format') {
      await addTagToQuestionInfo(copy.destination, 'rv:revise-format', env);
    }
    state.decisions[question.relpath] = {
      status: 'approved',
      reviewedAt: nowIso(),
      source: question.questionDir,
      copiedTo: copy.destination,
      reviseFormat: action === 'approve-format',
    };
    state.history.push({
      action,
      relpath: question.relpath,
      cursorBefore: currentIndex,
      prevDecision: previousDecision,
      copiedTo: copy.destination,
      createdCopyDir: !copy.destinationExists,
    });
    state.cursor = currentIndex + 1;
    message =
      action === 'approve-format'
        ? `Approved with rv:revise-format tag and advanced: ${copy.destination}`
        : `Approved, copied, and advanced: ${copy.destination}`;
  } else if (action === 'waiting' || action === 'erroneous') {
    const targetRoot = resolveRepoPath(env, action === 'waiting' ? normalized.waitingRoot : normalized.erroneousRoot);
    const copy = await copyQuestionDirectory(question.questionDir, targetRoot, question.relpath, env);
    const assessment = await applyAssessmentUpdate(action, {
      manifest,
      bank,
      relpathValue: question.relpath,
      config: normalized,
      env,
    });
    state.decisions[question.relpath] = {
      status: action,
      reviewedAt: nowIso(),
      source: question.questionDir,
      copiedTo: copy.destination,
    };
    state.history.push({
      action,
      relpath: question.relpath,
      cursorBefore: currentIndex,
      prevDecision: previousDecision,
      copiedTo: copy.destination,
      createdCopyDir: !copy.destinationExists,
      assessmentBackups: assessment.backups,
    });
    state.cursor = currentIndex + 1;
    message = `Marked ${action}, copied, and advanced: ${copy.destination} ${assessment.message}`.trim();
  } else {
    throw new Error(`Unsupported review action: ${action}`);
  }

  await saveState(statePath, state, env);
  return {
    message,
    snapshot: await buildReviewSnapshot(config, bankSlug, options),
  };
}

module.exports = {
  DEFAULT_CONFIG,
  normalizeReviewConfig,
  loadReviewContext,
  loadBankSession,
  searchPendingQuestions,
  updateReviewTags,
  jumpToQuestion,
  applyReviewAction,
  undoLastReviewAction,
  getReviewStatusSummary,
  normalizeReviewTag,
  filterReviewTags,
};
