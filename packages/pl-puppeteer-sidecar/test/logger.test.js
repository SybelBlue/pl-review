const test = require('node:test');
const assert = require('node:assert/strict');
const { createLogger } = require('../src/lib/logger');

test('logger colors levels through the terminal writer', () => {
  const writes = [];
  const logger = createLogger({
    verbose: true,
    write(message, options) {
      writes.push({ message, options });
    },
  });

  logger.info('ready');
  logger.warn('careful');
  logger.debug('trace');

  assert.deepEqual(writes, [
    { message: ' I | ready', options: { color: 'grey' } },
    { message: ' W | careful', options: { color: 'yellow' } },
    { message: ' D | trace', options: { color: 'white' } },
  ]);
});
