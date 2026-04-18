const test = require('node:test');
const assert = require('node:assert/strict');
const { BrowserSession } = require('../src/browser/session');

test('explicit indexing suppresses navigation-triggered auto-indexing', async () => {
  const session = new BrowserSession({
    logger: fakeLogger(),
  });

  const url = 'http://localhost:3000/pl/course/1/course_admin/questions';
  session.page = {
    url() {
      return url;
    },
  };

  let assessmentAutoIndexCalls = 0;
  let courseAutoIndexCalls = 0;

  session.updateCurrentQuestionFromUrl = () => {
    throw new Error('updateCurrentQuestionFromUrl should not run while auto-indexing is suppressed');
  };

  session.waitUntilReady = async () => {
    throw new Error('waitUntilReady should not run while auto-indexing is suppressed');
  };

  session.maybeAutoIndexAssessmentQuestions = async () => {
    assessmentAutoIndexCalls += 1;
    return null;
  };

  session.maybeAutoIndexCourseQuestions = async () => {
    courseAutoIndexCalls += 1;
    return null;
  };

  await session.withAutoIndexSuppressed(() => session.handleMainFrameNavigation(url));

  assert.equal(assessmentAutoIndexCalls, 0);
  assert.equal(courseAutoIndexCalls, 0);
  assert.equal(session.autoIndexSuppressionCount, 0);
});

function fakeLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}
