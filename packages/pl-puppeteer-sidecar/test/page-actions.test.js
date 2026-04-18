const test = require('node:test');
const assert = require('node:assert/strict');
const { indexQuestionsForCourse } = require('../src/prairielearn/page-actions');

test('indexQuestionsForCourse uses embedded table data when available', async () => {
  const calls = [];
  const page = createFakePage();

  const result = await indexQuestionsForCourse(page, 1, {
    logger: fakeLogger(),
  });

  assert.equal(result.selectorStrategy, 'questions-table-data');
  assert.equal(result.count, 2);
  assert.deepEqual(result.questions.map((question) => question.qid), ['basic-addition', 'basic-multiplication']);
  assert.deepEqual(result.questions.map((question) => question.link), [
    'http://localhost:3000/pl/course/1/question/1/preview',
    'http://localhost:3000/pl/course/1/question/2/preview',
  ]);

  assert.equal(calls.some((call) => call.type === 'pageSizeClick'), false, 'should not need to click All');

  function createFakePage() {
    const state = {
      title: 'Questions',
      url: 'http://localhost:3000/pl/course/1/course_admin/questions',
    };

    return {
      async goto(url) {
        calls.push({ type: 'goto', url });
        state.url = url;
      },
      url() {
        return state.url;
      },
      async title() {
        return state.title;
      },
      async waitForFunction(fn, options, ...args) {
        calls.push({
          type: 'waitForFunction',
          source: fn.toString(),
          options,
          args,
        });
      },
      async waitForNetworkIdle() {
        calls.push({ type: 'waitForNetworkIdle' });
      },
      async evaluate(fn, ...args) {
        const source = fn.toString();
        calls.push({
          type: 'evaluate',
          source,
          args,
        });

        if (source.includes('#questions-table-data') && source.includes('data-data')) {
          const previousDocument = global.document;
          const previousWindow = global.window;
          const previousAtob = global.atob;

          global.atob = (value) => Buffer.from(String(value), 'base64').toString('utf8');
          global.document = {
            querySelector(selector) {
              if (selector === '#questionsTable') {
                return {
                  getAttribute(name) {
                    if (name === 'data-data') {
                      return JSON.stringify([
                        {
                          id: '1',
                          qid: 'basic-addition',
                          title: 'Basic Addition',
                          topic: { name: 'Basic arithmetic' },
                          tags: [{ name: 'intro' }],
                        },
                        {
                          id: '2',
                          qid: 'basic-multiplication',
                          title: 'Basic Multiplication',
                          topic: { name: 'Basic arithmetic' },
                          tags: [{ name: 'intro' }],
                        },
                      ]);
                    }

                    return null;
                  },
                };
              }

              if (selector === '#questions-table-data') {
                return {
                  textContent: Buffer.from(JSON.stringify({ urlPrefix: '/pl/course/1' }), 'utf8').toString('base64'),
                  innerText: Buffer.from(JSON.stringify({ urlPrefix: '/pl/course/1' }), 'utf8').toString('base64'),
                };
              }

              return null;
            },
          };
          global.window = {
            location: {
              origin: 'http://localhost:3000',
              pathname: '/pl/course/1/course_admin/questions',
            },
          };

          try {
            return fn(...args);
          } finally {
            global.document = previousDocument;
            global.window = previousWindow;
            global.atob = previousAtob;
          }
        }

        if (source.includes('extractIndexedTableRows')) {
          throw new Error('fallback table scraping should not be used when embedded data is present');
        }

        if (source.includes('.page-list') && source.includes('.dropdown-item')) {
          calls.push({ type: 'pageSizeClick' });
          return { found: true, alreadySelected: false, currentLabel: '50' };
        }

        throw new Error(`Unexpected evaluate call: ${source}`);
      },
    };
  }
});

function fakeLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}
