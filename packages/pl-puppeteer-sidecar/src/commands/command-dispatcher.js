class CommandDispatcher {
  constructor({ session, logger }) {
    this.session = session;
    this.logger = logger;
  }

  async dispatch(input) {
    const trimmed = input.trim();

    if (!trimmed) {
      return {
        continueRunning: true,
      };
    }

    const firstSpace = trimmed.indexOf(' ');
    const command = (firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace)).toLowerCase();
    const rest = firstSpace === -1 ? '' : trimmed.slice(firstSpace + 1).trim();

    try {
      switch (command) {
        case 'help':
          return {
            continueRunning: true,
            output: [
              'Commands:',
              '  help',
              '  status',
              '  current',
              '  next',
              '  prev',
              '  reload',
              '  hard-reload',
              '  reload-disk',
              '  index-questions [courseNumber]',
              '  index-assessment',
              '  goto <url>',
              '  sync-refresh',
              '  quit',
            ].join('\n'),
          };

        case 'status': {
          const status = await this.session.getStatus();
          return {
            continueRunning: true,
            output: formatStatus(status),
          };
        }

        case 'next': {
          const result = await this.session.next();
          return {
            continueRunning: true,
            output: formatCommandOutput('Moved next', result),
          };
        }

        case 'current': {
          const result = await this.session.current();
          return {
            continueRunning: true,
            output: formatCommandOutput('Navigated to current', result),
          };
        }

        case 'prev': {
          const result = await this.session.prev();
          return {
            continueRunning: true,
            output: formatCommandOutput('Moved prev', result),
          };
        }

        case 'reload': {
          const result = await this.session.reload();
          return {
            continueRunning: true,
            output: formatCommandOutput('Reloaded', result),
          };
        }

        case 'hard-reload': {
          const result = await this.session.hardReload();
          return {
            continueRunning: true,
            output: formatCommandOutput('Hard-reloaded', result),
          };
        }

        case 'reload-disk': {
          const result = await this.session.reloadFromDisk();
          return {
            continueRunning: true,
            output: formatCommandOutput('Reloaded from disk', result),
          };
        }

        case 'index-questions': {
          const courseNumber = rest ? Number(rest) : 1;

          if (!Number.isInteger(courseNumber) || courseNumber < 1) {
            throw new Error('Usage: index-questions [courseNumber]');
          }

          const result = await this.session.indexQuestions(courseNumber);
          return {
            continueRunning: true,
            output: formatQuestionsIndexedSummary(result.count),
          };
        }

        case 'index-assessment': {
          const result = await this.session.indexAssessmentQuestions();
          return {
            continueRunning: true,
            output: formatQuestionsIndexedSummary(result.count),
          };
        }

        case 'goto': {
          if (!rest) {
            throw new Error('Usage: goto <url>');
          }

          const result = await this.session.goto(rest);
          return {
            continueRunning: true,
            output: formatCommandOutput('Navigated', result),
          };
        }

        case 'sync-refresh': {
          const result = await this.session.syncRefresh();
          return {
            continueRunning: true,
            output: formatCommandOutput('Sync refresh complete', result),
          };
        }

        case 'quit':
        case 'exit':
          return {
            continueRunning: false,
            output: 'Closing sidecar',
          };

        default:
          throw new Error(`Unknown command: ${command}`);
      }
    } catch (error) {
      this.logger.error(`Command failed: ${trimmed}`, error);

      return {
        continueRunning: true,
        output: `Error: ${error.message}`,
      };
    }
  }
}

function formatStatus(status) {
  const lines = [
    `Mode: ${status.connectedMode}`,
    `URL: ${status.url}`,
    `Title: ${status.title}`,
  ];

  if (status.currentQuestionQid) {
    lines.push(`Current QID: ${status.currentQuestionQid}`);
    lines.push(`Jump to: questions/${status.currentQuestionQid}/question.html`);
  }

  if (status.indexedQuestionSource) {
    lines.push(`Indexed Source: ${status.indexedQuestionSource} (${status.indexedQuestionCount})`);
  }

  return lines.join('\n');
}

function formatCommandOutput(prefix, result) {
  const lines = [prefix, formatStatus(result)];

  if (result.assessmentQuestionsIndex) {
    lines.push('Assessment Questions Index:');
    lines.push(JSON.stringify(result.assessmentQuestionsIndex, null, 2));
  }

  return lines.join('\n');
}

function formatQuestionsIndexedSummary(count) {
  return `(${count} questions indexed.)`;
}

module.exports = {
  CommandDispatcher,
  formatQuestionsIndexedSummary,
};
