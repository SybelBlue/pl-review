#!/usr/bin/env node

const { main } = require('../src/index');

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});

