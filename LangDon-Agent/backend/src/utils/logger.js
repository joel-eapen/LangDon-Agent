const levels = Object.freeze({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
});

const configuredLevel = process.env.LOG_LEVEL?.toLowerCase() || 'info';
const minimumLevel = levels[configuredLevel] ?? levels.info;

const serialize = (value) => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  return value;
};

const write = (level, message, metadata = {}) => {
  if (levels[level] < minimumLevel) {
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...Object.fromEntries(
      Object.entries(metadata).map(([key, value]) => [key, serialize(value)]),
    ),
  };

  process.stdout.write(`${JSON.stringify(entry)}\n`);
};

export const logger = Object.freeze({
  debug: (message, metadata) => write('debug', message, metadata),
  info: (message, metadata) => write('info', message, metadata),
  warn: (message, metadata) => write('warn', message, metadata),
  error: (message, metadata) => write('error', message, metadata),
});

export default logger;
