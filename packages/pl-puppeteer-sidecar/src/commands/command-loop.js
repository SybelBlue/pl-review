const readline = require('node:readline');

async function runCommandLoop({ dispatcher, logger, showPrompt = true }) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: showPrompt,
  });

  let closed = false;

  const closeLoop = () => {
    if (closed) {
      return;
    }

    closed = true;
    rl.close();
  };

  return new Promise((resolve) => {
    const writePrompt = () => {
      if (showPrompt && !closed) {
        rl.setPrompt('pl-sidecar> ');
        rl.prompt();
      }
    };

    let queue = Promise.resolve();

    rl.on('line', (line) => {
      queue = queue.then(async () => {
        const result = await dispatcher.dispatch(line);

        if (result.output) {
          process.stdout.write(`${result.output}\n`);
        }

        if (!result.continueRunning) {
          closeLoop();
          return;
        }

        writePrompt();
      }).catch((error) => {
        logger.error('Unexpected command-loop failure', error);
        writePrompt();
      });
    });

    rl.on('close', () => {
      resolve();
    });

    writePrompt();
  });
}

module.exports = {
  runCommandLoop,
};

