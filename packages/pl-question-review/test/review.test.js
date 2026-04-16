const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { promisify } = require('node:util');
const {
  createReviewManager,
  normalizeReviewTag,
  filterReviewTags,
} = require('../src/index.js');
const {
  loadManifestReviewSource,
  resolveManifestBankItems,
} = require('../src/manifest-adapter.js');

const execFileAsync = promisify(execFile);

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pl-question-review-'));
  const reviewRoot = path.join(root, 'questions', 'review');
  const bankDir = path.join(reviewRoot, 'bank-a', 'q1');
  const bankDir2 = path.join(reviewRoot, 'bank-a', 'q2');
  const assessmentRoot = path.join(root, 'assessments');
  const stateRoot = path.join(root, '.automation', 'review_state');

  await fs.mkdir(bankDir, { recursive: true });
  await fs.mkdir(bankDir2, { recursive: true });
  await fs.mkdir(path.join(assessmentRoot, 'bank-a'), { recursive: true });
  await fs.writeFile(
    path.join(bankDir, 'info.json'),
    `${JSON.stringify({ qid: 'Q1', title: 'Question One', uuid: 'old-1', tags: ['algebra'] }, null, 2)}\n`
  );
  await fs.writeFile(path.join(bankDir, 'question.html'), '<div>q1</div>');
  await fs.writeFile(
    path.join(bankDir2, 'info.json'),
    `${JSON.stringify({ qid: 'Q2', title: 'Question Two', uuid: 'old-2', tags: ['calculus', 'rv:legacy'] }, null, 2)}\n`
  );
  await fs.writeFile(path.join(bankDir2, 'question.html'), '<div>q2</div>');
  await fs.writeFile(
    path.join(assessmentRoot, 'bank-a', 'infoAssessment.json'),
    `${JSON.stringify({ set: 'Homework', module: 'Module', type: 'Homework' }, null, 2)}\n`
  );

  const manifestPath = path.join(reviewRoot, '_transpile_manifest.json');
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        output_root: 'questions/review',
        assessment_root: 'assessments',
        banks: [
          {
            bank_slug: 'bank-a',
            bank_ident: 'ba',
            bank_title: 'Bank A',
            questions: [
              {
                question_relpath: 'bank-a/q1',
                question_dir: path.relative(root, bankDir),
              },
              {
                question_relpath: 'bank-a/q2',
                question_dir: path.relative(root, bankDir2),
              },
            ],
          },
        ],
      },
      null,
      2
    )}\n`
  );

  return {
    root,
    config: {
      manifestPath: path.relative(root, manifestPath),
      stateRoot: path.relative(root, stateRoot),
      reviewedRoot: 'questions/reviewed',
      erroneousRoot: 'questions/erroneous',
      waitingRoot: 'questions/waiting',
    },
    items: [
      {
        id: 'Q1',
        title: 'Question One',
        questionDir: bankDir,
        relpath: 'bank-a/q1',
        questionId: 'review/bank-a/q1',
        courseRoot: root,
      },
      {
        id: 'Q2',
        title: 'Question Two',
        questionDir: bankDir2,
        relpath: 'bank-a/q2',
        questionId: 'review/bank-a/q2',
        courseRoot: root,
      },
    ],
  };
}

test('tag helpers normalize and filter review tags', () => {
  assert.equal(normalizeReviewTag('needs-work'), 'rv:needs-work');
  assert.equal(normalizeReviewTag('rv:keep'), 'rv:keep');
  assert.deepEqual(filterReviewTags(['rv:a', 'other', 'rv:b']), ['rv:a', 'rv:b']);
});

test('manager persists state by reviewKey and computes summary from item ids', async () => {
  const fixture = await makeFixture();
  const manager = createReviewManager(fixture.config, { cwd: fixture.root });

  const state = await manager.getReviewState('sidecar:sequence-1');
  assert.match(state.statePath, /\.json$/);
  assert.equal(state.state.reviewKey, 'sidecar:sequence-1');

  const summary = await manager.getReviewSummary({
    reviewKey: 'sidecar:sequence-1',
    itemIds: fixture.items.map((item) => item.id),
  });
  assert.deepEqual(summary.updatedSummary, {
    approved: 0,
    waiting: 0,
    erroneous: 0,
    pending: 2,
    total: 2,
    done: 0,
  });
});

test('manager updates review tags without sequence state input', async () => {
  const fixture = await makeFixture();
  const manager = createReviewManager(fixture.config, { cwd: fixture.root });

  const result = await manager.setReviewTags({
    reviewKey: 'sidecar:sequence-1',
    item: fixture.items[0],
    tags: ['checked', 'rv:needs-format'],
    itemIds: fixture.items.map((item) => item.id),
  });
  const info = JSON.parse(await fs.readFile(path.join(fixture.items[0].questionDir, 'info.json'), 'utf8'));

  assert.equal(result.stateChanged, true);
  assert.deepEqual(info.tags, ['algebra', 'rv:checked', 'rv:needs-format']);
});

test('manager approve copies question and regenerates uuid', async () => {
  const fixture = await makeFixture();
  const manager = createReviewManager(fixture.config, { cwd: fixture.root, randomUUID: () => 'new-uuid-1' });

  const result = await manager.applyReviewDecision({
    reviewKey: 'sidecar:sequence-1',
    item: fixture.items[0],
    decision: 'approve',
    itemIds: fixture.items.map((item) => item.id),
  });
  const copiedInfo = JSON.parse(
    await fs.readFile(path.join(fixture.root, 'questions', 'reviewed', 'bank-a', 'q1', 'info.json'), 'utf8')
  );

  assert.equal(result.copiedTo.endsWith(path.join('questions', 'reviewed', 'bank-a', 'q1')), true);
  assert.equal(copiedInfo.uuid, 'new-uuid-1');
  assert.equal(result.updatedSummary.approved, 1);
});

test('manager waiting updates assessment and undo restores state', async () => {
  const fixture = await makeFixture();
  const manager = createReviewManager(fixture.config, { cwd: fixture.root, randomUUID: () => 'new-uuid-2' });

  const applied = await manager.applyReviewDecision({
    reviewKey: 'sidecar:sequence-2',
    item: fixture.items[0],
    decision: 'waiting',
    itemIds: fixture.items.map((item) => item.id),
  });
  const waitingAssessmentPath = path.join(fixture.root, 'assessments', 'waiting', 'infoAssessment.json');
  const waitingAssessment = JSON.parse(await fs.readFile(waitingAssessmentPath, 'utf8'));

  assert.equal(applied.assessmentChanged, true);
  assert.equal(waitingAssessment.zones[0].questions[0].id, 'review/bank-a/q1');

  const undone = await manager.undoLastReviewAction('sidecar:sequence-2', fixture.items.map((item) => item.id));
  assert.equal(undone.updatedSummary.waiting, 0);
  await assert.rejects(fs.readFile(waitingAssessmentPath, 'utf8'));
});

test('manager lists decisions for a review key', async () => {
  const fixture = await makeFixture();
  const manager = createReviewManager(fixture.config, { cwd: fixture.root });

  await manager.applyReviewDecision({
    reviewKey: 'sidecar:sequence-3',
    item: fixture.items[0],
    decision: 'skip',
    itemIds: fixture.items.map((item) => item.id),
  });

  const listed = await manager.listReviewDecisions('sidecar:sequence-3');
  assert.deepEqual(listed.decisions, {});
  assert.equal(listed.canUndo, true);
});

test('manifest adapter loads banks and resolves legacy items', async () => {
  const fixture = await makeFixture();
  const source = await loadManifestReviewSource(fixture.config, { cwd: fixture.root });
  const bank = await resolveManifestBankItems(fixture.config, 'bank-a', { cwd: fixture.root });

  assert.equal(source.banks.length, 1);
  assert.equal(bank.reviewKey, 'manifest:bank-a');
  assert.equal(bank.items[0].relpath, 'bank-a/q1');
  assert.equal(bank.items[0].questionId, 'review/bank-a/q1');
});

test('cli wrapper is available from the package bin and prints state', async () => {
  const fixture = await makeFixture();
  const cliPath = path.resolve(__dirname, '../bin/pl-question-review.js');

  const { stdout } = await execFileAsync(
    process.execPath,
    [cliPath, 'state', '--review-key', 'sidecar:sequence-1', '--pretty'],
    {
      cwd: fixture.root,
      env: process.env,
      maxBuffer: 1024 * 1024,
    }
  );

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.reviewKey, 'sidecar:sequence-1');
  assert.equal(parsed.state.reviewKey, 'sidecar:sequence-1');
});

test('cli help renders command-specific guidance', async () => {
  const fixture = await makeFixture();
  const cliPath = path.resolve(__dirname, '../bin/pl-question-review.js');

  const { stdout } = await execFileAsync(
    process.execPath,
    [cliPath, 'help', 'apply'],
    {
      cwd: fixture.root,
      env: process.env,
      maxBuffer: 1024 * 1024,
    }
  );

  assert.match(stdout, /Apply a review decision to a question item\./);
  assert.match(stdout, /Supported decisions are `approve`, `approve-format`, `waiting`, `erroneous`, and `skip`/);
  assert.match(stdout, /pl-question-review apply --review-key sidecar:sequence-1 --decision approve --item-file \.\/item\.json/);
});
