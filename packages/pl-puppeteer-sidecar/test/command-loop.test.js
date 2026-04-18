const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createCommandCompleter,
  getPrompt,
} = require('../src/commands/command-loop');

test('prompt is blue', () => {
  assert.equal(getPrompt(), '\x1b[34mpl-sidecar\x1b[0m> ');
});

test('command completer suggests matching commands', () => {
  const completer = createCommandCompleter();

  assert.deepEqual(completer('i')[0], ['index-questions', 'index-assessment']);
  assert.deepEqual(completer('re')[0], ['reload', 'reload-disk']);
  assert.deepEqual(completer('go')[0], ['goto']);
  assert.deepEqual(completer('goto https://example.com')[0], []);
});
