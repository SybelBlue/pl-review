const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PuppeteerSidecarService } = require('../src/service');

test('start creates a session and delegates lifecycle methods', async () => {
  const calls = [];
  const session = new FakeSession();
  const service = new PuppeteerSidecarService({
    logger: fakeLogger(),
    sessionFactory: (options) => {
      calls.push(options);
      return session;
    },
  });

  const status = await service.start({ startUrl: 'http://127.0.0.1:3000' });

  assert.equal(status.url, 'http://example.test/question/1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].startUrl, 'http://127.0.0.1:3000');
  assert.equal(session.startCalls, 1);

  const reloadResult = await service.reloadFromDisk();
  assert.equal(reloadResult.action, 'reload-disk');
  assert.equal(session.reloadFromDiskCalls, 1);

  const detachResult = await service.detach();
  assert.deepEqual(detachResult, { detached: true });
  assert.equal(session.closeCalls, 1);
});

test('attach resolves the requested target id and binds the session to its page', async () => {
  const targetPage = { url: () => 'http://127.0.0.1:3000/pl/course/1' };
  const session = new FakeSession();
  const browser = createBrowserWithTargets([
    createTarget({ targetId: 'ignore-me', page: { url: () => 'http://irrelevant.test' } }),
    createTarget({ targetId: 'target-42', page: targetPage }),
  ]);

  const service = new PuppeteerSidecarService({
    logger: fakeLogger(),
    sessionFactory: () => session,
    browserConnector: {
      connect: async () => browser,
    },
  });

  const result = await service.attach({
    browserWSEndpoint: 'ws://127.0.0.1:9222/devtools/browser/test',
    targetId: 'target-42',
    webContentsId: 77,
  });

  assert.equal(result.targetId, 'target-42');
  assert.equal(result.webContentsId, 77);
  assert.equal(session.attachCalls.length, 1);
  assert.equal(session.attachCalls[0].browser, browser);
  assert.equal(session.attachCalls[0].page, targetPage);
  assert.equal(session.attachCalls[0].connectionMode, 'attach');

  await service.close();
  assert.equal(session.closeCalls, 1);
});

test('service forwards structured session events', async () => {
  const session = new FakeSession();
  const service = new PuppeteerSidecarService({
    logger: fakeLogger(),
    sessionFactory: () => session,
  });

  await service.start();

  const eventPromise = new Promise((resolve) => {
    service.once('event', resolve);
  });

  session.emit('event', {
    type: 'question-indexed',
    heading: 'Assessment Questions Index',
    result: { action: 'index-assessment', count: 3 },
  });

  const event = await eventPromise;
  assert.equal(event.type, 'question-indexed');
  assert.equal(event.result.count, 3);
});

class FakeSession extends EventEmitter {
  constructor() {
    super();
    this.startCalls = 0;
    this.closeCalls = 0;
    this.reloadFromDiskCalls = 0;
    this.attachCalls = [];
  }

  async start() {
    this.startCalls += 1;
  }

  async attach(options) {
    this.attachCalls.push(options);
    return this.getStatus();
  }

  async close() {
    this.closeCalls += 1;
  }

  async getStatus() {
    return {
      connectedMode: 'attach',
      title: 'Question Page',
      url: 'http://example.test/question/1',
      indexedQuestionCount: 0,
      indexedQuestionSource: null,
      currentQuestionQid: null,
    };
  }

  async reloadFromDisk() {
    this.reloadFromDiskCalls += 1;
    return {
      action: 'reload-disk',
    };
  }
}

function createBrowserWithTargets(targets) {
  return {
    disconnectCalls: 0,
    targets() {
      return targets;
    },
    async disconnect() {
      this.disconnectCalls += 1;
    },
  };
}

function createTarget({ targetId, page }) {
  return {
    type() {
      return 'webview';
    },
    async page() {
      return page;
    },
    async createCDPSession() {
      return {
        async send(method) {
          assert.equal(method, 'Target.getTargetInfo');
          return {
            targetInfo: {
              targetId,
            },
          };
        },
        async detach() {},
      };
    },
  };
}

function fakeLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}
