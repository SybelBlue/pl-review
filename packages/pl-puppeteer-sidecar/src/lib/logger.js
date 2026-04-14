function createLogger({ verbose = true } = {}) {
  const write = (level, message, error) => {
    if (level === 'DEBUG' && !verbose) {
      return;
    }

    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level}] ${message}`;

    if (level === 'ERROR') {
      console.error(line);
      if (error) {
        console.error(error.stack || error.message || String(error));
      }
      return;
    }

    if (level === 'WARN') {
      console.warn(line);
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

