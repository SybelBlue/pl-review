const { EventEmitter } = require('node:events');
const puppeteer = require('puppeteer');
const { BrowserSession } = require('./browser/session');

class PuppeteerSidecarService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.sessionFactory = options.sessionFactory || ((sessionOptions) => new BrowserSession(sessionOptions));
    this.browserConnector = options.browserConnector || {
      connect: ({ browserWSEndpoint }) =>
        puppeteer.connect({
          browserWSEndpoint,
          defaultViewport: null,
        }),
    };
    this.session = null;
    this.boundSessionEventHandler = null;
  }

  async start(sessionOptions = {}) {
    await this.detach();

    const session = this.createSession(sessionOptions);
    this.bindSession(session);
    this.session = session;
    await session.start();
    return session.getStatus();
  }

  async attach(options = {}) {
    const browserWSEndpoint = String(options.browserWSEndpoint || '').trim();
    const targetId = String(options.targetId || '').trim();

    if (!browserWSEndpoint) {
      throw new Error('attach requires a browser WebSocket endpoint');
    }

    if (!targetId) {
      throw new Error('attach requires a DevTools target id');
    }

    await this.detach();

    const browser = await this.browserConnector.connect({ browserWSEndpoint });

    try {
      const target = await findBrowserTargetById(browser, targetId);
      if (!target) {
        throw new Error(`Could not find browser target ${targetId}`);
      }

      const page = await target.page();
      if (!page) {
        throw new Error(`Target ${targetId} is not a page-backed target`);
      }

      const session = this.createSession({
        ...options,
        browserWSEndpoint,
      });
      this.bindSession(session);
      this.session = session;

      const status = await session.attach({
        browser,
        page,
        connectionMode: 'attach',
        waitUntilReady: options.waitUntilReady !== false,
      });

      this.emit('event', {
        type: 'attached',
        targetId,
        webContentsId: options.webContentsId || null,
        status,
      });

      return {
        targetId,
        webContentsId: options.webContentsId || null,
        status,
      };
    } catch (error) {
      if (this.session) {
        this.unbindSession(this.session);
        this.session = null;
      }
      await browser.disconnect().catch(() => {});
      throw error;
    }
  }

  async detach() {
    if (!this.session) {
      return {
        detached: false,
      };
    }

    const session = this.session;
    this.unbindSession(session);
    this.session = null;
    await session.close();
    this.emit('event', { type: 'detached' });

    return {
      detached: true,
    };
  }

  async close() {
    await this.detach();
  }

  async getStatus() {
    return this.runSessionMethod('getStatus');
  }

  async goto(url) {
    return this.runSessionMethod('goto', url);
  }

  async reload() {
    return this.runSessionMethod('reload');
  }

  async hardReload() {
    return this.runSessionMethod('hardReload');
  }

  async reloadFromDisk() {
    return this.runSessionMethod('reloadFromDisk');
  }

  async indexQuestions(courseNumber = 1) {
    return this.runSessionMethod('indexQuestions', courseNumber);
  }

  async indexAssessmentQuestions() {
    return this.runSessionMethod('indexAssessmentQuestions');
  }

  async current() {
    return this.runSessionMethod('current');
  }

  async next() {
    return this.runSessionMethod('next');
  }

  async prev() {
    return this.runSessionMethod('prev');
  }

  async syncRefresh() {
    return this.runSessionMethod('syncRefresh');
  }

  createSession(sessionOptions) {
    return this.sessionFactory({
      logger: this.logger,
      ...sessionOptions,
    });
  }

  bindSession(session) {
    this.boundSessionEventHandler = (event) => {
      this.emit('event', event);
    };
    session.on('event', this.boundSessionEventHandler);
  }

  unbindSession(session) {
    if (!session || !this.boundSessionEventHandler) {
      return;
    }

    session.off('event', this.boundSessionEventHandler);
    this.boundSessionEventHandler = null;
  }

  async runSessionMethod(methodName, ...args) {
    if (!this.session) {
      throw new Error('Puppeteer sidecar is not attached');
    }

    return this.session[methodName](...args);
  }
}

async function findBrowserTargetById(browser, targetId, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const targets = browser.targets();

    for (const target of targets) {
      if (await targetMatchesTargetId(target, targetId)) {
        return target;
      }
    }

    await wait(200);
  }

  return null;
}

async function targetMatchesTargetId(target, targetId) {
  let session;

  try {
    session = await target.createCDPSession();
    const { targetInfo } = await session.send('Target.getTargetInfo');
    return targetInfo?.targetId === targetId;
  } catch (_error) {
    return false;
  } finally {
    if (session) {
      await session.detach().catch(() => {});
    }
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

module.exports = {
  PuppeteerSidecarService,
  findBrowserTargetById,
};
