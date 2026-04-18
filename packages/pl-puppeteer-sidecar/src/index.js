const { resolve } = require('node:path');
const { runCommandLoop } = require('./commands/command-loop');
const {
  CommandDispatcher,
  formatQuestionsIndexedSummary,
} = require('./commands/command-dispatcher');
const { parseArgs, renderUsage } = require('./lib/args');
const { createLogger } = require('./lib/logger');
const { createTerminalWriter } = require('./lib/terminal');
const { PuppeteerSidecarService } = require('./service');

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    process.stdout.write(`${renderUsage()}\n`);
    return;
  }

  const terminal = createTerminalWriter();
  const logger = createLogger({ verbose: options.verbose, write: terminal.write });
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
        terminal.write(`${event.heading}:\n${formatQuestionsIndexedSummary(event.result.count)}`, {
          color: 'green',
        });
        return;
      }

      terminal.write(`${event.heading}:\n${JSON.stringify(event.result, null, 2)}`, {
        color: 'green',
      });
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
    logger.info('Enter "help" for a full list of commands, or "quit" to quit.');

    await runCommandLoop({
      dispatcher,
      logger,
      showPrompt: Boolean(process.stdin.isTTY),
      terminal,
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
