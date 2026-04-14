const puppeteer = require('puppeteer');
const {
  followLoadFromDisk,
  getCourseQuestionsIndexMatch,
  getPageSnapshot,
  getAssessmentQuestionsOverviewMatch,
  indexQuestionsForCourse,
  indexQuestionsForCurrentAssessment,
  waitForPageReady,
} = require('../prairielearn/page-actions');

class BrowserSession {
  constructor(options) {
    this.options = options;
    this.logger = options.logger;
    this.browser = null;
    this.page = null;
    this.isConnected = false;
    this.autoIndexPromise = null;
    this.lastAutoIndexedUrl = null;
    this.lastAutoIndexedMode = null;
    this.latestQuestionIndex = null;
    this.currentQuestionQid = null;
  }

  async start() {
    if (this.browser) {
      return;
    }

    if (this.options.browserWSEndpoint) {
      this.logger.info(`Connecting to browser via WebSocket: ${this.options.browserWSEndpoint}`);
      this.browser = await puppeteer.connect({
        browserWSEndpoint: this.options.browserWSEndpoint,
        defaultViewport: null,
      });
      this.isConnected = true;
    } else {
      this.logger.info('Launching dedicated browser window');
      this.browser = await puppeteer.launch({
        defaultViewport: null,
        executablePath: this.options.executablePath || undefined,
        headless: this.options.headless,
        userDataDir: this.options.userDataDir,
        args: [
          '--disable-dev-shm-usage',
        ],
      });
    }

    this.browser.on('disconnected', () => {
      this.logger.warn('Browser connection closed');
    });

    this.page = await this.pickPage();
    this.attachPageListeners(this.page);

    await this.page.bringToFront();

    if (this.options.startUrl) {
      await this.goto(this.options.startUrl);
    } else if (this.page.url() !== 'about:blank') {
      await this.waitUntilReady('startup');
    } else {
      this.logger.info('Browser is ready on about:blank; use "goto <url>" to open PrairieLearn');
    }
  }

  async pickPage() {
    const pages = await this.browser.pages();
    const chosenPage = pages.find((page) => page.url() !== 'about:blank') || pages[0];

    if (chosenPage) {
      this.logger.info(`Using existing page: ${chosenPage.url() || 'about:blank'}`);
      return chosenPage;
    }

    this.logger.info('Creating a new page');
    return this.browser.newPage();
  }

  attachPageListeners(page) {
    page.on('pageerror', (error) => {
      this.logger.error('Page error', error);
    });

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        this.logger.info(`Navigated: ${frame.url()}`);
        void this.handleMainFrameNavigation(frame.url());
      }
    });

    page.on('close', () => {
      this.logger.warn('Controlled page was closed');
    });
  }

  async goto(url) {
    this.ensurePage();
    this.logger.info(`Navigating to ${url}`);

    await this.page.goto(url, {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });

    await this.waitUntilReady('goto');
    this.updateCurrentQuestionFromUrl(this.page.url());
    const autoIndexResult = await this.maybeAutoIndexAssessmentQuestions();
    return {
      ...(await this.getStatus()),
      ...(autoIndexResult ? { assessmentQuestionsIndex: autoIndexResult } : {}),
    };
  }

  async reload() {
    this.ensurePage();
    this.logger.info('Reloading page');

    await this.page.reload({
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });

    await this.waitUntilReady('reload');
    this.updateCurrentQuestionFromUrl(this.page.url());
    const autoIndexResult = await this.maybeAutoIndexAssessmentQuestions();
    return {
      ...(await this.getStatus()),
      ...(autoIndexResult ? { assessmentQuestionsIndex: autoIndexResult } : {}),
    };
  }

  async hardReload() {
    this.ensurePage();
    this.logger.info('Hard-reloading page with cache bypass');

    const client = await this.page.target().createCDPSession();

    try {
      await client.send('Network.enable');
      await client.send('Network.setCacheDisabled', { cacheDisabled: true });
      await client.send('Page.reload', { ignoreCache: true });
      await this.waitUntilReady('hard-reload');
    } finally {
      await client.send('Network.setCacheDisabled', { cacheDisabled: false }).catch(() => {});
      await client.detach().catch(() => {});
    }

    this.updateCurrentQuestionFromUrl(this.page.url());
    const autoIndexResult = await this.maybeAutoIndexAssessmentQuestions();
    return {
      ...(await this.getStatus()),
      ...(autoIndexResult ? { assessmentQuestionsIndex: autoIndexResult } : {}),
    };
  }

  async reloadFromDisk() {
    this.ensurePage();
    this.logger.info('Reloading PrairieLearn content from disk');

    const result = await followLoadFromDisk(this.page, {
      logger: this.logger,
      readySelectors: this.options.readySelectors,
    });

    const autoIndexResult = await this.maybeAutoIndexAssessmentQuestions();

    return {
      ...result,
      ...(autoIndexResult ? { assessmentQuestionsIndex: autoIndexResult } : {}),
      ...(await this.getStatus()),
    };
  }

  async indexQuestions(courseNumber = 1) {
    this.ensurePage();
    this.logger.info(`Indexing PrairieLearn questions for course ${courseNumber}`);

    const result = await indexQuestionsForCourse(this.page, Number(courseNumber), {
      logger: this.logger,
      readySelectors: this.options.readySelectors,
    });

    this.registerQuestionIndex(result);
    return result;
  }

  async indexAssessmentQuestions() {
    this.ensurePage();
    const result = await indexQuestionsForCurrentAssessment(this.page, {
      logger: this.logger,
      readySelectors: this.options.readySelectors,
    });

    this.registerQuestionIndex(result);
    return result;
  }

  async syncRefresh() {
    this.ensurePage();
    this.logger.info('Running sync-refresh hook');
    return this.reload();
  }

  async next() {
    return this.navigate('next');
  }

  async prev() {
    return this.navigate('prev');
  }

  async navigate(direction) {
    this.ensurePage();
    const result = await this.navigateIndexed(direction);

    const autoIndexResult = await this.maybeAutoIndexAssessmentQuestions();

    return {
      ...result,
      ...(autoIndexResult ? { assessmentQuestionsIndex: autoIndexResult } : {}),
      ...(await this.getStatus()),
    };
  }

  async waitUntilReady(reason) {
    this.ensurePage();
    await waitForPageReady(this.page, {
      logger: this.logger,
      reason,
      readySelectors: this.options.readySelectors,
      timeoutMs: 20000,
    });
  }

  async maybeAutoIndexAssessmentQuestions() {
    this.ensurePage();

    const match = getAssessmentQuestionsOverviewMatch(this.page.url());
    if (!match) {
      return null;
    }

    if (this.lastAutoIndexedUrl === this.page.url() && this.lastAutoIndexedMode === 'assessment') {
      return null;
    }

    this.logger.info(
      `Detected assessment questions overview for course instance ${match.courseInstanceId}, assessment ${match.assessmentId}; indexing questions`
    );

    const result = await indexQuestionsForCurrentAssessment(this.page, {
      logger: this.logger,
      readySelectors: this.options.readySelectors,
    });

    this.registerQuestionIndex(result);
    this.lastAutoIndexedUrl = this.page.url();
    this.lastAutoIndexedMode = 'assessment';
    this.logger.info(`Indexed ${result.count} assessment questions`);
    return result;
  }

  async maybeAutoIndexCourseQuestions() {
    this.ensurePage();

    const match = getCourseQuestionsIndexMatch(this.page.url());
    if (!match) {
      return null;
    }

    if (this.lastAutoIndexedUrl === this.page.url() && this.lastAutoIndexedMode === 'course') {
      return null;
    }

    this.logger.info(`Detected course questions index for course ${match.courseNumber}; indexing questions`);

    const result = await indexQuestionsForCourse(this.page, match.courseNumber, {
      logger: this.logger,
      readySelectors: this.options.readySelectors,
    });

    this.registerQuestionIndex(result);
    this.lastAutoIndexedUrl = this.page.url();
    this.lastAutoIndexedMode = 'course';
    this.logger.info(`Indexed ${result.count} course questions`);
    return result;
  }

  async handleMainFrameNavigation(url) {
    if (!this.page || this.page.url() !== url) {
      return;
    }

    if (this.autoIndexPromise) {
      return;
    }

    this.autoIndexPromise = (async () => {
      try {
        await this.waitUntilReady('navigation-listener');
        this.updateCurrentQuestionFromUrl(url);
        const result = await this.maybeAutoIndexAssessmentQuestions()
          || await this.maybeAutoIndexCourseQuestions();

        if (result) {
          process.stdout.write(`${formatAutoIndexHeading(result)}:\n${JSON.stringify(result, null, 2)}\n`);
        }
      } catch (error) {
        this.logger.error('Automatic assessment indexing failed', error);
      } finally {
        this.autoIndexPromise = null;
      }
    })();

    await this.autoIndexPromise;
  }

  async getStatus() {
    this.ensurePage();
    const snapshot = await getPageSnapshot(this.page);
    this.updateCurrentQuestionFromUrl(snapshot.url);

    return {
      currentQuestionQid: this.currentQuestionQid,
      connectedMode: this.isConnected ? 'connect' : 'launch',
      indexedQuestionCount: this.latestQuestionIndex ? this.latestQuestionIndex.questions.length : 0,
      indexedQuestionSource: this.latestQuestionIndex ? this.latestQuestionIndex.action : null,
      title: snapshot.title,
      url: snapshot.url,
    };
  }

  async current() {
    this.ensurePage();

    const { entry } = this.getCurrentQuestionEntry();
    if (!entry || !entry.link) {
      throw new Error('No current indexed question is registered. Index questions first, then open a question page or use next/prev.');
    }

    this.logger.info(`Navigating to current indexed question ${entry.qid} (${entry.link})`);
    await this.page.goto(entry.link, {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });
    await this.waitUntilReady('current');
    this.currentQuestionQid = entry.qid || this.currentQuestionQid;

    return {
      action: 'current',
      currentQuestionQid: this.currentQuestionQid,
      ...(await this.getStatus()),
    };
  }

  registerQuestionIndex(result) {
    if (!result || !Array.isArray(result.questions)) {
      return;
    }

    this.latestQuestionIndex = {
      action: result.action,
      questions: result.questions
        .filter((question) => question && question.link)
        .map((question) => ({
          ...question,
          normalizedLink: normalizeUrlForComparison(question.link),
        })),
      sourceUrl: result.url || this.page?.url() || null,
    };

    this.updateCurrentQuestionFromUrl(this.page?.url() || null);

    if (!this.currentQuestionQid && this.latestQuestionIndex.questions.length > 0) {
      this.currentQuestionQid = this.latestQuestionIndex.questions[0].qid || null;
    }
  }

  updateCurrentQuestionFromUrl(url) {
    if (!url || !this.latestQuestionIndex) {
      return;
    }

    const normalizedUrl = normalizeUrlForComparison(url);
    const matchedQuestion = this.latestQuestionIndex.questions.find((question) => {
      if (!question.normalizedLink) {
        return false;
      }

      return question.normalizedLink === normalizedUrl;
    });

    if (matchedQuestion && matchedQuestion.qid) {
      this.currentQuestionQid = matchedQuestion.qid;
    }
  }

  getCurrentQuestionEntry() {
    if (!this.latestQuestionIndex || this.latestQuestionIndex.questions.length === 0) {
      throw new Error('No indexed question list is available. Run index-questions or index-assessment first.');
    }

    this.updateCurrentQuestionFromUrl(this.page?.url() || null);

    const questions = this.latestQuestionIndex.questions;
    const currentIndex = questions.findIndex((question) => question.qid && question.qid === this.currentQuestionQid);

    return {
      currentIndex,
      entry: currentIndex >= 0 ? questions[currentIndex] : null,
      questions,
    };
  }

  async navigateIndexed(direction) {
    const { currentIndex, entry, questions } = this.getCurrentQuestionEntry();

    if (currentIndex < 0 || !entry) {
      throw new Error('Current question is not recognized in the indexed list. Open a question from the indexed set or use current after setting one.');
    }

    const delta = direction === 'next' ? 1 : direction === 'prev' ? -1 : 0;
    if (delta === 0) {
      throw new Error(`Unsupported indexed navigation direction: ${direction}`);
    }

    const targetIndex = currentIndex + delta;
    if (targetIndex < 0 || targetIndex >= questions.length) {
      throw new Error(`Cannot move ${direction}; already at the ${direction === 'next' ? 'last' : 'first'} indexed question.`);
    }

    const target = questions[targetIndex];
    if (!target.link) {
      throw new Error(`Indexed question ${target.qid || '(unknown)'} does not have a navigation link.`);
    }

    this.logger.info(`Navigating ${direction} via indexed question list: ${entry.qid} -> ${target.qid}`);
    await this.page.goto(target.link, {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });
    await this.waitUntilReady(`${direction} indexed navigation`);
    this.currentQuestionQid = target.qid || this.currentQuestionQid;

    return {
      action: direction,
      currentQuestionQid: this.currentQuestionQid,
      selectorStrategy: 'indexed-question-list',
    };
  }

  ensurePage() {
    if (!this.page) {
      throw new Error('Browser page is not ready');
    }
  }

  async close() {
    if (!this.browser) {
      return;
    }

    const browser = this.browser;
    const wasConnected = this.isConnected;
    this.browser = null;
    this.page = null;
    this.isConnected = false;

    if (wasConnected) {
      this.logger.info('Disconnecting from external browser');
      await browser.disconnect();
      return;
    }

    this.logger.info('Closing dedicated browser');
    await browser.close();
  }
}

function formatAutoIndexHeading(result) {
  if (!result || !result.action) {
    return 'Question Index';
  }

  if (result.action === 'index-assessment') {
    return 'Assessment Questions Index';
  }

  if (result.action === 'index-questions') {
    return 'Course Questions Index';
  }

  return 'Question Index';
}

function normalizeUrlForComparison(url) {
  if (!url) {
    return null;
  }

  const normalized = new URL(url);
  normalized.hash = '';
  normalized.search = '';
  return normalized.toString();
}

module.exports = {
  BrowserSession,
};
