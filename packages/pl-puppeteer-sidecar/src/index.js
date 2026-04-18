const { resolve } = require('node:path');
const { runCommandLoop } = require('./commands/command-loop');
const {
  CommandDispatcher,
  formatQuestionsIndexedSummary,
} = require('./commands/command-dispatcher');
const { parseArgs, renderUsage } = require('./lib/args');
const { createLogger } = require('./lib/logger');
const { PuppeteerSidecarService } = require('./service');

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    process.stdout.write(`${renderUsage()}\n`);
    return;
  }

  const logger = createLogger({ verbose: options.verbose });
  const userDataDir = options.userDataDir || resolve(process.cwd(), '.pl-puppeteer-profile');
  const service = new PuppeteerSidecarService({ logger });

  let isShuttingDown = false;

  const shutdown = async (signal) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info(`Shutting down sidecar (${signal})`);

    try {
      await service.close();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  try {
    service.on('event', (event) => {
      if (event?.type !== 'question-indexed' || !event.result) {
        return;
      }

      if (event.result.action === 'index-questions') {
        process.stdout.write(`${event.heading}:\n${formatQuestionsIndexedSummary(event.result.count)}\n`);
        return;
      }

      process.stdout.write(`${event.heading}:\n${JSON.stringify(event.result, null, 2)}\n`);
    });

    await service.start({
      browserWSEndpoint: options.browserWSEndpoint,
      executablePath: options.executablePath,
      headless: options.headless,
      readySelectors: options.readySelectors,
      startUrl: options.url,
      userDataDir,
    });

    const dispatcher = new CommandDispatcher({ logger, session: service });

    logger.info('Sidecar ready');
    logger.info('Commands: help, status, current, next, prev, reload, hard-reload, reload-disk, index-questions [courseNumber], index-assessment, goto <url>, sync-refresh, quit');

    await runCommandLoop({
      dispatcher,
      logger,
      showPrompt: Boolean(process.stdin.isTTY),
    });
  } finally {
    await service.close();
  }
}

module.exports = {
  main,
  PuppeteerSidecarService,
  createLogger,
};
