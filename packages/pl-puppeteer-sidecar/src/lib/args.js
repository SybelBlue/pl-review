function parseArgs(argv) {
  const options = {
    browserWSEndpoint: process.env.PL_BROWSER_WS_ENDPOINT || null,
    executablePath: process.env.PL_EXECUTABLE_PATH || null,
    headless: normalizeBoolean(process.env.PL_HEADLESS, false),
    help: false,
    readySelectors: [],
    url: process.env.PL_START_URL || null,
    userDataDir: process.env.PL_USER_DATA_DIR || null,
    verbose: normalizeBoolean(process.env.PL_VERBOSE, true),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--help' || token === '-h') {
      options.help = true;
      continue;
    }

    if (token === '--headless') {
      options.headless = true;
      continue;
    }

    if (token === '--no-headless') {
      options.headless = false;
      continue;
    }

    if (token === '--quiet') {
      options.verbose = false;
      continue;
    }

    if (token.startsWith('--url=')) {
      options.url = token.slice('--url='.length);
      continue;
    }

    if (token === '--url') {
      options.url = readValue(argv, ++index, '--url');
      continue;
    }

    if (token.startsWith('--browser-ws-endpoint=')) {
      options.browserWSEndpoint = token.slice('--browser-ws-endpoint='.length);
      continue;
    }

    if (token === '--browser-ws-endpoint') {
      options.browserWSEndpoint = readValue(argv, ++index, '--browser-ws-endpoint');
      continue;
    }

    if (token.startsWith('--user-data-dir=')) {
      options.userDataDir = token.slice('--user-data-dir='.length);
      continue;
    }

    if (token === '--user-data-dir') {
      options.userDataDir = readValue(argv, ++index, '--user-data-dir');
      continue;
    }

    if (token.startsWith('--executable-path=')) {
      options.executablePath = token.slice('--executable-path='.length);
      continue;
    }

    if (token === '--executable-path') {
      options.executablePath = readValue(argv, ++index, '--executable-path');
      continue;
    }

    if (token.startsWith('--ready-selector=')) {
      options.readySelectors.push(token.slice('--ready-selector='.length));
      continue;
    }

    if (token === '--ready-selector') {
      options.readySelectors.push(readValue(argv, ++index, '--ready-selector'));
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return options;
}

function readValue(argv, index, flagName) {
  const value = argv[index];

  if (!value) {
    throw new Error(`Missing value for ${flagName}`);
  }

  return value;
}

function normalizeBoolean(value, fallback) {
  if (value == null) {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function renderUsage() {
  return [
    'Usage: pl-sidecar [options]',
    '',
    'Options:',
    '  --url <url>                      Starting URL for PrairieLearn',
    '  --browser-ws-endpoint <wsUrl>   Connect to an existing browser instead of launching one',
    '  --headless                       Launch headless',
    '  --no-headless                    Force visible browser window (default)',
    '  --user-data-dir <path>           Browser profile directory for persistent login/session state',
    '  --executable-path <path>         Chrome/Chromium executable path override',
    '  --ready-selector <selector>      Extra CSS selector to wait for after navigation; may be repeated',
    '  --quiet                          Reduce log noise',
    '  --help                           Show this help',
    '',
    'Environment variables:',
    '  PL_START_URL, PL_BROWSER_WS_ENDPOINT, PL_HEADLESS, PL_USER_DATA_DIR, PL_EXECUTABLE_PATH, PL_VERBOSE',
  ].join('\n');
}

module.exports = {
  parseArgs,
  renderUsage,
};

