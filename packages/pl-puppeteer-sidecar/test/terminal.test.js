const test = require('node:test');
const assert = require('node:assert/strict');
const readline = require('node:readline');
const { mock } = require('node:test');
const { createTerminalWriter } = require('../src/lib/terminal');

test('terminal writer redraws the prompt after colored output', () => {
  const clearLineMock = mock.method(readline, 'clearLine', () => {});
  const cursorToMock = mock.method(readline, 'cursorTo', () => {});

  const output = createFakeOutput();
  const terminal = createTerminalWriter({ output });
  const rl = {
    promptCalls: [],
    prompt(preserveCursor) {
      this.promptCalls.push(preserveCursor);
    },
  };

  terminal.attachReadline(rl);
  terminal.write('hello world', { color: 'green' });

  assert.deepEqual(output.writes, ['\x1b[32mhello world\n\x1b[0m']);
  assert.equal(clearLineMock.mock.callCount(), 1);
  assert.equal(cursorToMock.mock.callCount(), 1);
  assert.deepEqual(rl.promptCalls, [true]);

  clearLineMock.mock.restore();
  cursorToMock.mock.restore();
});

test('terminal writer can skip redrawing the prompt', () => {
  const clearLineMock = mock.method(readline, 'clearLine', () => {});
  const cursorToMock = mock.method(readline, 'cursorTo', () => {});

  const output = createFakeOutput();
  const terminal = createTerminalWriter({ output });
  const rl = {
    promptCalls: [],
    prompt(preserveCursor) {
      this.promptCalls.push(preserveCursor);
    },
  };

  terminal.attachReadline(rl);
  terminal.write('done', { color: 'green', redrawPrompt: false });

  assert.deepEqual(output.writes, ['\x1b[32mdone\n\x1b[0m']);
  assert.equal(clearLineMock.mock.callCount(), 0);
  assert.equal(cursorToMock.mock.callCount(), 0);
  assert.deepEqual(rl.promptCalls, []);

  clearLineMock.mock.restore();
  cursorToMock.mock.restore();
});

test('terminal writer can write raw control codes', () => {
  const clearLineMock = mock.method(readline, 'clearLine', () => {});
  const cursorToMock = mock.method(readline, 'cursorTo', () => {});

  const output = createFakeOutput();
  const terminal = createTerminalWriter({ output });
  terminal.writeRaw('\x1b[0m');

  assert.deepEqual(output.writes, ['\x1b[0m']);
  assert.equal(clearLineMock.mock.callCount(), 0);
  assert.equal(cursorToMock.mock.callCount(), 0);

  clearLineMock.mock.restore();
  cursorToMock.mock.restore();
});

function createFakeOutput() {
  return {
    isTTY: true,
    writes: [],
    write(chunk) {
      this.writes.push(chunk);
    },
  };
}
