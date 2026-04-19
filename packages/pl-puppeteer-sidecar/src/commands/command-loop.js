const readline = require("node:readline");

const COMMANDS = [
  "help",
  "status",
  "current",
  "next",
  "prev",
  "reload",
  "hard-reload",
  "reload-disk",
  "index-questions",
  "index-assessment",
  "goto",
  "sync-refresh",
  "quit",
  "exit",
];

async function runCommandLoop({
  dispatcher,
  logger,
  showPrompt = true,
  terminal = null,
}) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: showPrompt,
    completer: createCommandCompleter(),
  });

  if (terminal) {
    terminal.attachReadline(rl, { showPrompt });
  }

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
        rl.setPrompt(getPrompt());
        rl.prompt();
      }
    };

    let queue = Promise.resolve();

    rl.on("line", (line) => {
      if (terminal) {
        terminal.writeRaw("\x1b[0m");
      } else if (showPrompt && process.stdout.isTTY) {
        process.stdout.write("\x1b[0m");
      }

      queue = queue
        .then(async () => {
          const result = await dispatcher.dispatch(line);
          const wroteOutput = Boolean(result.output);

          if (result.output) {
            if (terminal) {
              `${result.output}`.split("\n").forEach((s, i) => {
                terminal.write(` - | ${(i > 0 ? '  ' : '')}${s}`, {
                  color: "green",
                  redrawPrompt: result.continueRunning,
                });
              });
            } else {
              process.stdout.write(`${result.output}\n`);
            }
          }

          if (!result.continueRunning) {
            closeLoop();
            return;
          }

          if (terminal && wroteOutput) {
            return;
          }

          writePrompt();
        })
        .catch((error) => {
          logger.error("Unexpected command-loop failure", error);
          if (!terminal) {
            writePrompt();
          }
        });
    });

    rl.on("close", () => {
      if (terminal) {
        terminal.detachReadline();
      }
      resolve();
    });

    writePrompt();
  });
}

module.exports = {
  createCommandCompleter,
  getPrompt,
  runCommandLoop,
};

function createCommandCompleter(commands = COMMANDS) {
  return (line) => {
    const trimmed = String(line || "").trimStart();

    if (!trimmed || trimmed.includes(" ")) {
      return [[], line];
    }

    const lower = trimmed.toLowerCase();
    const matches = commands.filter((command) => command.startsWith(lower));

    return [matches, line];
  };
}

function getPrompt() {
  return "\x1b[34m > | ";
}
