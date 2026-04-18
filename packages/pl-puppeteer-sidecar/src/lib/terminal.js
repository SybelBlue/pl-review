const readline = require('node:readline');

function createTerminalWriter({ output = process.stdout } = {}) {
  let rl = null;
  let promptEnabled = false;

  function attachReadline(nextRl, { showPrompt = true } = {}) {
    rl = nextRl;
    promptEnabled = showPrompt;
  }

  function detachReadline() {
    rl = null;
    promptEnabled = false;
  }

  function write(text) {
    const chunk = String(text).endsWith('\n') ? String(text) : `${String(text)}\n`;
    const redrawPrompt = Boolean(rl && promptEnabled && output.isTTY);

    if (redrawPrompt) {
      readline.clearLine(output, 0);
      readline.cursorTo(output, 0);
    }

    output.write(chunk);

    if (redrawPrompt) {
      rl.prompt(true);
    }
  }

  return {
    attachReadline,
    detachReadline,
    write,
  };
}

module.exports = {
  createTerminalWriter,
};
