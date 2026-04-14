const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const {
  loadReviewContext,
  buildSequenceSnapshot,
  updateSequenceReviewTags,
  applySequenceReviewAction,
  searchPendingQuestions,
  updateReviewTags,
  applyReviewAction,
  undoLastReviewAction,
  normalizeReviewTag,
  filterReviewTags,
} = require('../src/index.js');

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
    `${JSON.stringify({ title: 'Question One', uuid: 'old-1', tags: ['algebra'] }, null, 2)}\n`
  );
  await fs.writeFile(path.join(bankDir, 'question.html'), '<div>q1</div>');
  await fs.writeFile(
    path.join(bankDir2, 'info.json'),
    `${JSON.stringify({ title: 'Question Two', uuid: 'old-2', tags: ['calculus', 'rv:legacy'] }, null, 2)}\n`
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
                item_ident: 'item-1',
                question_slug: 'q1',
              },
              {
                question_relpath: 'bank-a/q2',
                question_dir: path.relative(root, bankDir2),
                item_ident: 'item-2',
                question_slug: 'q2',
              },
            ],
          },
        ],
        assessments: [{ bank_slug: 'bank-a', info_assessment_path: 'assessments/bank-a/infoAssessment.json' }],
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
  };
}

test('tag helpers normalize and filter review tags', () => {
  assert.equal(normalizeReviewTag('needs-work'), 'rv:needs-work');
  assert.equal(normalizeReviewTag('rv:keep'), 'rv:keep');
  assert.deepEqual(filterReviewTags(['rv:a', 'other', 'rv:b']), ['rv:a', 'rv:b']);
});

test('loadReviewContext returns banks and current item', async () => {
  const fixture = await makeFixture();
  const snapshot = await loadReviewContext({ ...fixture.config, reviewBankSlug: 'bank-a' }, { cwd: fixture.root });

  assert.equal(snapshot.banks.length, 1);
  assert.equal(snapshot.session.currentItem.relpath, 'bank-a/q1');
  assert.equal(snapshot.session.summary.pending, 2);
  assert.match(snapshot.session.statePath, /bank-a\.json$/);
});

test('searchPendingQuestions filters by title and relpath', async () => {
  const fixture = await makeFixture();
  const results = await searchPendingQuestions({ ...fixture.config, reviewBankSlug: 'bank-a' }, 'Two', { cwd: fixture.root });

  assert.equal(results.length, 1);
  assert.equal(results[0].relpath, 'bank-a/q2');
});

test('updateReviewTags preserves non-review tags and updates catalog', async () => {
  const fixture = await makeFixture();
  const snapshot = await updateReviewTags({ ...fixture.config }, 'bank-a', ['rv:checked', 'needs-format'], { cwd: fixture.root });
  const info = JSON.parse(await fs.readFile(path.join(fixture.root, 'questions', 'review', 'bank-a', 'q1', 'info.json'), 'utf8'));

  assert.deepEqual(info.tags, ['algebra', 'rv:checked', 'rv:needs-format']);
  assert.deepEqual(snapshot.session.currentItem.reviewTags, ['rv:checked', 'rv:needs-format']);
  assert.deepEqual(snapshot.session.tagCatalog, ['rv:checked', 'rv:needs-format']);
});

test('applyReviewAction approve copies question, regenerates uuid, and advances', async () => {
  const fixture = await makeFixture();
  const result = await applyReviewAction(fixture.config, 'bank-a', 'approve', { cwd: fixture.root, randomUUID: () => 'new-uuid-1' });
  const copiedInfo = JSON.parse(
    await fs.readFile(path.join(fixture.root, 'questions', 'reviewed', 'bank-a', 'q1', 'info.json'), 'utf8')
  );

  assert.equal(copiedInfo.uuid, 'new-uuid-1');
  assert.equal(result.snapshot.session.currentItem.relpath, 'bank-a/q2');
  assert.equal(result.snapshot.session.summary.approved, 1);
});

test('applyReviewAction waiting updates assessment and undo restores state', async () => {
  const fixture = await makeFixture();
  const applied = await applyReviewAction(fixture.config, 'bank-a', 'waiting', { cwd: fixture.root, randomUUID: () => 'new-uuid-2' });
  const waitingAssessmentPath = path.join(fixture.root, 'assessments', 'waiting', 'infoAssessment.json');
  const waitingAssessment = JSON.parse(await fs.readFile(waitingAssessmentPath, 'utf8'));

  assert.equal(applied.snapshot.session.summary.waiting, 1);
  assert.equal(waitingAssessment.zones[0].questions[0].id, 'review/bank-a/q1');

  const undone = await undoLastReviewAction(fixture.config, 'bank-a', { cwd: fixture.root });
  assert.equal(undone.snapshot.session.summary.waiting, 0);
  await assert.rejects(fs.readFile(waitingAssessmentPath, 'utf8'));
});

test('generic live sequence snapshot resolves local question dirs and persists review tags', async () => {
  const fixture = await makeFixture();
  const sequence = {
    sourceType: 'sidecar',
    sequenceId: 'live-sequence-1',
    sequenceTitle: 'Live Sequence',
    items: [{ id: 'Q1', qid: 'Q1', title: 'Question One', link: 'http://localhost/q1' }],
  };
  const resolveItem = async () => ({
    questionDir: path.join(fixture.root, 'questions', 'review', 'bank-a', 'q1'),
    relpath: 'bank-a/q1',
    questionId: 'bank-a/q1',
    courseRoot: fixture.root,
  });

  const snapshot = await buildSequenceSnapshot(fixture.config, sequence, { cwd: fixture.root, resolveItem });
  assert.equal(snapshot.currentSequenceId, 'live-sequence-1');
  assert.equal(snapshot.session.currentItem.resolutionStatus, 'resolved');

  const tagged = await updateSequenceReviewTags(fixture.config, sequence, ['checked'], { cwd: fixture.root, resolveItem });
  assert.deepEqual(tagged.session.currentItem.reviewTags, ['rv:checked']);
});

test('generic live sequence actions copy question content and advance queue', async () => {
  const fixture = await makeFixture();
  const sequence = {
    sourceType: 'sidecar',
    sequenceId: 'live-sequence-2',
    sequenceTitle: 'Live Sequence',
    items: [
      { id: 'Q1', qid: 'Q1', title: 'Question One', link: 'http://localhost/q1' },
      { id: 'Q2', qid: 'Q2', title: 'Question Two', link: 'http://localhost/q2' },
    ],
  };
  const resolveItem = async (item) => ({
    questionDir: path.join(fixture.root, 'questions', 'review', 'bank-a', item.id === 'Q1' ? 'q1' : 'q2'),
    relpath: `bank-a/${item.id === 'Q1' ? 'q1' : 'q2'}`,
    questionId: `bank-a/${item.id === 'Q1' ? 'q1' : 'q2'}`,
    courseRoot: fixture.root,
  });

  const applied = await applySequenceReviewAction(fixture.config, sequence, 'approve', {
    cwd: fixture.root,
    resolveItem,
    randomUUID: () => 'generic-uuid',
  });
  assert.equal(applied.snapshot.session.currentItem.qid, 'Q2');
  const copiedInfo = JSON.parse(
    await fs.readFile(path.join(fixture.root, 'questions', 'reviewed', 'bank-a', 'q1', 'info.json'), 'utf8')
  );
  assert.equal(copiedInfo.uuid, 'generic-uuid');
});
