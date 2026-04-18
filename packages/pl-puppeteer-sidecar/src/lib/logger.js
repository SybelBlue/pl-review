function createLogger({ verbose = true, write: terminalWrite = null } = {}) {
  const write = (level, message, error) => {
    if (level === 'DEBUG' && !verbose) {
      return;
    }

    const line = ` ${level[0]} | ${message}`;
    const colorByLevel = {
      DEBUG: 'white',
      INFO: 'grey',
      WARN: 'yellow',
      ERROR: 'red',
    };

    if (level === 'ERROR') {
      if (terminalWrite) {
        const errorLine = error ? (error.stack || error.message || String(error)) : null;
        terminalWrite(errorLine ? `${line}\n${errorLine}` : line, { color: colorByLevel[level] });
        return;
      }

      console.error(line);
      if (error) {
        console.error(error.stack || error.message || String(error));
      }
      return;
    }

    if (level === 'WARN') {
      if (terminalWrite) {
        terminalWrite(line, { color: colorByLevel[level] });
        return;
      }

      console.warn(line);
      return;
    }

    if (terminalWrite) {
      terminalWrite(line, { color: colorByLevel[level] });
      return;
    }

    console.log(line);
  };

  return {
    debug(message) {
      write('DEBUG', message);
    },
    info(message) {
      write('INFO', message);
    },
    warn(message) {
      write('WARN', message);
    },
    error(message, error) {
      write('ERROR', message, error);
    },
  };
}

module.exports = {
  createLogger,
};
