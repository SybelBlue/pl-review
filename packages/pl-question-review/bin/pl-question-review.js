#!/usr/bin/env node

const { main } = require('../src/cli.js');

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
