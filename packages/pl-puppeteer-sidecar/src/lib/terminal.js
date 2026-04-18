const readline = require('node:readline');

function createTerminalWriter({ output = process.stdout } = {}) {
  let rl = null;
  let promptEnabled = false;
  const colors = {
    green: '\x1b[32m',
  };

  function attachReadline(nextRl, { showPrompt = true } = {}) {
    rl = nextRl;
    promptEnabled = showPrompt;
  }

  function detachReadline() {
    rl = null;
    promptEnabled = false;
  }

  function write(text, { color = null } = {}) {
    const chunk = String(text).endsWith('\n') ? String(text) : `${String(text)}\n`;
    const redrawPrompt = Boolean(rl && promptEnabled && output.isTTY);
    const colorPrefix = color && output.isTTY ? colors[color] || '' : '';
    const colorSuffix = colorPrefix ? '\x1b[0m' : '';
    const renderedChunk = colorPrefix ? `${colorPrefix}${chunk}${colorSuffix}` : chunk;

    if (redrawPrompt) {
      readline.clearLine(output, 0);
      readline.cursorTo(output, 0);
    }

    output.write(renderedChunk);

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
