const { resolve } = require('node:path');
const { BrowserSession } = require('./browser/session');
const { runCommandLoop } = require('./commands/command-loop');
const { CommandDispatcher } = require('./commands/command-dispatcher');
const { parseArgs, renderUsage } = require('./lib/args');
const { createLogger } = require('./lib/logger');

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    process.stdout.write(`${renderUsage()}\n`);
    return;
  }

  const logger = createLogger({ verbose: options.verbose });
  const userDataDir = options.userDataDir || resolve(process.cwd(), '.pl-puppeteer-profile');

  const session = new BrowserSession({
    logger,
    browserWSEndpoint: options.browserWSEndpoint,
    executablePath: options.executablePath,
    headless: options.headless,
    readySelectors: options.readySelectors,
    startUrl: options.url,
    userDataDir,
  });

  let isShuttingDown = false;

  const shutdown = async (signal) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info(`Shutting down sidecar (${signal})`);

    try {
      await session.close();
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
    await session.start();

    const dispatcher = new CommandDispatcher({ logger, session });

    logger.info('Sidecar ready');
    logger.info('Commands: help, status, current, next, prev, reload, hard-reload, reload-disk, index-questions [courseNumber], index-assessment, goto <url>, sync-refresh, quit');

    await runCommandLoop({
      dispatcher,
      logger,
      showPrompt: Boolean(process.stdin.isTTY),
    });
  } finally {
    await session.close();
  }
}

module.exports = {
  main,
};
