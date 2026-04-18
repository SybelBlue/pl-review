const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs, renderUsage } = require('../src/lib/args');

test('verbose logging is off by default', () => {
  const options = parseArgs([]);
  assert.equal(options.verbose, false);
});

test('verbose logging can be enabled explicitly', () => {
  const options = parseArgs(['--verbose']);
  assert.equal(options.verbose, true);
});

test('help text mentions verbose mode', () => {
  assert.match(renderUsage(), /--verbose\s+Enable debug logging/);
});
