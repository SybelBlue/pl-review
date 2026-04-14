const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizeReviewConfig } = require('./index.js');

function createEnvironment(options = {}) {
  return {
    fs: options.fs || fs,
    path: options.path || path,
    cwd: options.cwd || process.cwd(),
  };
}

function resolveRepoPath(env, value) {
  return env.path.resolve(env.cwd, String(value || ''));
}

async function readJsonFile(filePath, env) {
  const raw = await env.fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function loadManifestReviewSource(config = {}, options = {}) {
  const env = createEnvironment(options);
  const normalized = normalizeReviewConfig(config);
  const manifestPath = resolveRepoPath(env, config.manifestPath);
  const manifest = await readJsonFile(manifestPath, env);
  const banks = Array.isArray(manifest.banks) ? manifest.banks : [];

  return {
    manifestPath,
    banks: banks.map((bank) => ({
      bankSlug: bank.bank_slug,
      bankIdent: bank.bank_ident || '',
      bankTitle: bank.bank_title || bank.bank_slug,
      itemCount: Array.isArray(bank.questions) ? bank.questions.length : 0,
    })),
    config: normalized,
  };
}

async function resolveManifestBankItems(config = {}, bankKey, options = {}) {
  const env = createEnvironment(options);
  const manifestPath = resolveRepoPath(env, config.manifestPath);
  const manifest = await readJsonFile(manifestPath, env);
  const banks = Array.isArray(manifest.banks) ? manifest.banks : [];
  const bank = banks.find((entry) => entry.bank_slug === bankKey || entry.bank_ident === bankKey);

  if (!bank) {
    const available = banks.map((entry) => entry.bank_slug).filter(Boolean).sort();
    throw new Error(`Bank "${bankKey}" not found in manifest. Available bank slugs: ${available.join(', ')}`);
  }

  const outputRoot = String(manifest.output_root || 'questions/review');
  const outputRootResolved = resolveRepoPath(env, outputRoot);
  const prefix = inferQuestionIdPrefix(outputRootResolved, env);

  return {
    reviewKey: `manifest:${bank.bank_slug}`,
    sequenceId: bank.bank_slug,
    sequenceTitle: bank.bank_title || bank.bank_slug,
    items: Array.isArray(bank.questions)
      ? bank.questions.map((question) => {
          const relpath = String(question.question_relpath || '');
          return {
            id: relpath,
            title: '',
            questionDir: env.path.resolve(env.cwd, String(question.question_dir)),
            relpath,
            questionId: prefix ? `${prefix}/${relpath.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')}` : relpath,
          };
        })
      : [],
  };
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

module.exports = {
  loadManifestReviewSource,
  resolveManifestBankItems,
};
