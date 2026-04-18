const readline = require('node:readline');

function createTerminalWriter({ output = process.stdout } = {}) {
  let rl = null;
  let promptEnabled = false;
  const colors = {
    gray: '\x1b[90m',
    grey: '\x1b[90m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    white: '\x1b[37m',
    yellow: '\x1b[33m',
  };

  function attachReadline(nextRl, { showPrompt = true } = {}) {
    rl = nextRl;
    promptEnabled = showPrompt;
  }

  function detachReadline() {
    rl = null;
    promptEnabled = false;
  }

  function write(text, { color = null, redrawPrompt = true } = {}) {
    const chunk = String(text).endsWith('\n') ? String(text) : `${String(text)}\n`;
    const shouldRedrawPrompt = Boolean(rl && promptEnabled && output.isTTY && redrawPrompt);
    const colorPrefix = color && output.isTTY ? colors[color] || '' : '';
    const colorSuffix = colorPrefix ? '\x1b[0m' : '';
    const renderedChunk = colorPrefix ? `${colorPrefix}${chunk}${colorSuffix}` : chunk;

    if (shouldRedrawPrompt) {
      readline.clearLine(output, 0);
      readline.cursorTo(output, 0);
    }

    output.write(renderedChunk);

    if (shouldRedrawPrompt) {
      rl.prompt(true);
    }
  }

  function writeRaw(text) {
    output.write(String(text));
  }

  return {
    attachReadline,
    detachReadline,
    write,
    writeRaw,
  };
}

module.exports = {
  createTerminalWriter,
};
