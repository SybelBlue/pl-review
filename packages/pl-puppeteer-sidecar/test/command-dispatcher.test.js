const test = require('node:test');
const assert = require('node:assert/strict');
const { CommandDispatcher } = require('../src/commands/command-dispatcher');

test('index-questions prints a summary instead of JSON', async () => {
  const session = {
    async indexQuestions(courseNumber) {
      assert.equal(courseNumber, 3);
      return {
        count: 42,
      };
    },
  };

  const dispatcher = new CommandDispatcher({
    logger: fakeLogger(),
    session,
  });

  const result = await dispatcher.dispatch('index-questions 3');

  assert.equal(result.continueRunning, true);
  assert.equal(result.output, '42 questions indexed.');
  assert.equal(result.output.includes('JSON'), false);
});

test('index-questions without an argument delegates without forcing course 1', async () => {
  let receivedCourseNumber = Symbol('unset');
  const dispatcher = new CommandDispatcher({
    logger: fakeLogger(),
    session: {
      async getStatus() {
        return {
          url: 'http://localhost:3000/pl/course/17/course_admin/questions',
        };
      },
      async indexQuestions(courseNumber) {
        receivedCourseNumber = courseNumber;
        return {
          count: 7,
        };
      },
    },
  });

  const result = await dispatcher.dispatch('index-questions');

  assert.equal(receivedCourseNumber, 17);
  assert.equal(result.output, '7 questions indexed.');
});

function fakeLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}
