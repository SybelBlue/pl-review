const fs = require('node:fs/promises');
const path = require('node:path');
const { createReviewManager } = require('./index.js');

function parseArgs(argv) {
  const options = {
    command: '',
    configFile: '',
    configJson: '',
    cwd: '',
    decision: '',
    help: false,
    helpTopic: '',
    itemFile: '',
    itemJson: '',
    itemIds: [],
    pretty: false,
    reviewKey: '',
    tags: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('-')) {
      if (!options.command) {
        options.command = token;
        continue;
      }

      if (options.command === 'help' && !options.helpTopic) {
        options.helpTopic = token;
        continue;
      }

      throw new Error(`Unknown argument: ${token}`);
    }

    if (token === '--help' || token === '-h') {
      options.help = true;
      continue;
    }

    if (token === '--pretty') {
      options.pretty = true;
      continue;
    }

    if (token === '--review-key') {
      options.reviewKey = readValue(argv, ++index, '--review-key');
      continue;
    }

    if (token.startsWith('--review-key=')) {
      options.reviewKey = token.slice('--review-key='.length);
      continue;
    }

    if (token === '--config-file') {
      options.configFile = readValue(argv, ++index, '--config-file');
      continue;
    }

    if (token.startsWith('--config-file=')) {
      options.configFile = token.slice('--config-file='.length);
      continue;
    }

    if (token === '--config-json') {
      options.configJson = readValue(argv, ++index, '--config-json');
      continue;
    }

    if (token.startsWith('--config-json=')) {
      options.configJson = token.slice('--config-json='.length);
      continue;
    }

    if (token === '--cwd') {
      options.cwd = readValue(argv, ++index, '--cwd');
      continue;
    }

    if (token.startsWith('--cwd=')) {
      options.cwd = token.slice('--cwd='.length);
      continue;
    }

    if (token === '--decision') {
      options.decision = readValue(argv, ++index, '--decision');
      continue;
    }

    if (token.startsWith('--decision=')) {
      options.decision = token.slice('--decision='.length);
      continue;
    }

    if (token === '--item-file') {
      options.itemFile = readValue(argv, ++index, '--item-file');
      continue;
    }

    if (token.startsWith('--item-file=')) {
      options.itemFile = token.slice('--item-file='.length);
      continue;
    }

    if (token === '--item-json') {
      options.itemJson = readValue(argv, ++index, '--item-json');
      continue;
    }

    if (token.startsWith('--item-json=')) {
      options.itemJson = token.slice('--item-json='.length);
      continue;
    }

    if (token === '--item-id') {
      options.itemIds.push(readValue(argv, ++index, '--item-id'));
      continue;
    }

    if (token.startsWith('--item-id=')) {
      options.itemIds.push(token.slice('--item-id='.length));
      continue;
    }

    if (token === '--item-ids') {
      options.itemIds.push(...splitList(readValue(argv, ++index, '--item-ids')));
      continue;
    }

    if (token.startsWith('--item-ids=')) {
      options.itemIds.push(...splitList(token.slice('--item-ids='.length)));
      continue;
    }

    if (token === '--tag') {
      options.tags.push(readValue(argv, ++index, '--tag'));
      continue;
    }

    if (token.startsWith('--tag=')) {
      options.tags.push(token.slice('--tag='.length));
      continue;
    }

    if (token === '--tags') {
      options.tags.push(...splitList(readValue(argv, ++index, '--tags')));
      continue;
    }

    if (token.startsWith('--tags=')) {
      options.tags.push(...splitList(token.slice('--tags='.length)));
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return options;
}

function readValue(argv, index, flagName) {
  const value = argv[index];
  if (value == null || value === '') {
    throw new Error(`Missing value for ${flagName}`);
  }
  return value;
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function loadConfig(options) {
  const baseDir = options.cwd || process.cwd();

  if (options.configJson) {
    return JSON.parse(options.configJson);
  }

  if (options.configFile) {
    const configPath = path.resolve(baseDir, options.configFile);
    return JSON.parse(await fs.readFile(configPath, 'utf8'));
  }

  return {};
}

async function loadItem(options) {
  const baseDir = options.cwd || process.cwd();

  if (options.itemJson) {
    return JSON.parse(options.itemJson);
  }

  if (options.itemFile) {
    const itemPath = path.resolve(baseDir, options.itemFile);
    return JSON.parse(await fs.readFile(itemPath, 'utf8'));
  }

  return null;
}

const COMMAND_HELP = {
  state: {
    summary: 'Print the saved review state for a review key.',
    details: [
      'Reads the persisted review state JSON from the configured state root.',
      'Use this when you want to inspect the raw decision map, history, tag catalog, or timestamps.',
      'This command does not modify any files.',
      'Requires: --review-key',
      'Useful when debugging why a review run is behaving a certain way.',
    ],
    examples: [
      'pl-question-review state --review-key sidecar:sequence-1',
      'pl-question-review state --review-key manifest:bank-a --pretty',
    ],
  },
  decisions: {
    summary: 'Print only the decision map for a review key.',
    details: [
      'Returns the `decisions` object from the saved review state.',
      'Use this when you only need to know which item ids are approved, waiting, or erroneous.',
      'This is a lighter-weight view than `state`, but it still does not modify any files.',
      'Requires: --review-key',
    ],
    examples: [
      'pl-question-review decisions --review-key sidecar:sequence-1',
    ],
  },
  summary: {
    summary: 'Print aggregate progress counts for a review key.',
    details: [
      'Computes approved, waiting, erroneous, pending, total, and done counts from saved decisions.',
      'Optionally narrow the summary to a specific set of item ids with `--item-id` or `--item-ids`.',
      'This command is read-only and safe to run repeatedly.',
      'Requires: --review-key',
    ],
    examples: [
      'pl-question-review summary --review-key sidecar:sequence-1',
      'pl-question-review summary --review-key sidecar:sequence-1 --item-ids q1,q2',
      'pl-question-review summary --review-key sidecar:sequence-1 --item-id q1 --item-id q2',
    ],
  },
  'set-tags': {
    summary: 'Replace the review tags on a question item.',
    details: [
      'Loads a question item from `--item-file` or `--item-json` and updates the item\'s `info.json` tags.',
      'Only review tags are changed; non-review tags are preserved.',
      'The item must include `id`, `questionDir`, and `relpath`.',
      'Use `--tag` multiple times or `--tags` with a comma-separated list.',
      'Requires: --review-key and item input.',
    ],
    examples: [
      'pl-question-review set-tags --review-key sidecar:sequence-1 --item-file ./item.json --tag needs-work --tag rv:manual',
      'pl-question-review set-tags --review-key sidecar:sequence-1 --item-json \'{"id":"Q1","questionDir":"./questions/q1","relpath":"bank/q1"}\' --tags needs-work,rv:manual',
    ],
  },
  apply: {
    summary: 'Apply a review decision to a question item.',
    details: [
      'Copies the question into the appropriate destination root and updates the saved review state.',
      'Supported decisions are `approve`, `approve-format`, `waiting`, `erroneous`, and `skip`.',
      'For `waiting` and `erroneous`, the CLI can also update the matching assessment info file when an assessment root is configured.',
      'The item must include `id`, `questionDir`, `relpath`, and `questionId`.',
      'Requires: --review-key, --decision, and item input.',
    ],
    examples: [
      'pl-question-review apply --review-key sidecar:sequence-1 --decision approve --item-file ./item.json',
      'pl-question-review apply --review-key sidecar:sequence-1 --decision waiting --item-file ./item.json --pretty',
    ],
  },
  undo: {
    summary: 'Undo the last saved review action.',
    details: [
      'Reverses the most recent action recorded in the review history for the selected review key.',
      'Restores copied files and any backed-up assessment files when possible.',
      'This command is useful when a review decision was applied by mistake.',
      'Requires: --review-key',
    ],
    examples: [
      'pl-question-review undo --review-key sidecar:sequence-1',
    ],
  },
  help: {
    summary: 'Show general help or command-specific help.',
    details: [
      'Run `pl-question-review help` to view the full command list and the detailed reference for every command.',
      'Run `pl-question-review help <command>` to jump directly to one command\'s documentation.',
      'You can also use `--help` with a command, such as `pl-question-review apply --help`.',
    ],
    examples: [
      'pl-question-review help',
      'pl-question-review help apply',
      'pl-question-review apply --help',
    ],
  },
};

function renderUsage() {
  return renderUsageForTopic('');
}

function renderUsageForTopic(topic) {
  const normalizedTopic = String(topic || '').trim();
  const commandHelp = COMMAND_HELP[normalizedTopic];
  const sections = [
    'Usage: pl-question-review <command> [options]',
    '',
    'Commands:',
    ...Object.entries(COMMAND_HELP).map(([name, help]) => `  ${String(name).padEnd(14)}${help.summary}`),
    '',
    'Global Options:',
    '  --review-key <key>        Review key to operate on',
    '  --config-file <path>      JSON config file for createReviewManager',
    '  --config-json <json>      Inline JSON config for createReviewManager',
    '  --cwd <path>              Working directory for resolving relative paths',
    '  --pretty                  Pretty-print JSON output',
    '  --help, -h                Show this help',
  ];

  if (normalizedTopic === '') {
    sections.push(
      '',
      'Command-specific details:',
      ...Object.entries(COMMAND_HELP).flatMap(([name, help]) => [
        '',
        `${name}:`,
        ...help.details.map((line) => `  ${line}`),
      ]),
      '',
      'Examples:',
      '  pl-question-review state --review-key sidecar:sequence-1',
      '  pl-question-review summary --review-key sidecar:sequence-1 --item-ids q1,q2',
      '  pl-question-review apply --review-key sidecar:sequence-1 --decision approve --item-file ./item.json',
      '  pl-question-review help apply',
    );
    return sections.join('\n');
  }

  if (!commandHelp) {
    sections.push(
      '',
      `Unknown help topic: ${normalizedTopic}`,
      'Use `pl-question-review help` to list available commands.'
    );
    return sections.join('\n');
  }

  sections.push(
    '',
    `${normalizedTopic}:`,
    ...commandHelp.details.map((line) => `  ${line}`),
    '',
    'Examples:',
    ...commandHelp.examples.map((line) => `  ${line}`)
  );
  return sections.join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help || !options.command) {
    const helpTopic = options.command === 'help' ? options.helpTopic : options.command || '';
    process.stdout.write(`${renderUsageForTopic(helpTopic)}\n`);
    return;
  }

  if (!options.reviewKey && options.command !== 'help') {
    throw new Error('Missing required option: --review-key');
  }

  const config = await loadConfig(options);
  const manager = createReviewManager(config, {
    cwd: options.cwd || process.cwd(),
  });
  const item = await loadItem(options);
  const itemIds = [...new Set(options.itemIds.map((value) => String(value).trim()).filter(Boolean))];

  let result;

  switch (options.command) {
    case 'state':
      result = await manager.getReviewState(options.reviewKey);
      break;
    case 'decisions':
      result = await manager.listReviewDecisions(options.reviewKey);
      break;
    case 'summary':
      result = await manager.getReviewSummary({ reviewKey: options.reviewKey, itemIds });
      break;
    case 'set-tags':
      if (!item) {
        throw new Error('set-tags requires --item-file or --item-json');
      }
      result = await manager.setReviewTags({
        reviewKey: options.reviewKey,
        item,
        tags: options.tags,
        itemIds,
      });
      break;
    case 'apply':
      if (!item) {
        throw new Error('apply requires --item-file or --item-json');
      }
      if (!options.decision) {
        throw new Error('apply requires --decision');
      }
      result = await manager.applyReviewDecision({
        reviewKey: options.reviewKey,
        item,
        decision: options.decision,
        itemIds,
      });
      break;
    case 'undo':
      result = await manager.undoLastReviewAction(options.reviewKey, itemIds);
      break;
    case 'help':
      process.stdout.write(`${renderUsageForTopic(options.helpTopic)}\n`);
      return;
    default:
      throw new Error(`Unknown command: ${options.command}`);
  }

  const output = options.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result);
  process.stdout.write(`${output}\n`);
}

module.exports = {
  main,
  parseArgs,
  renderUsage,
};
