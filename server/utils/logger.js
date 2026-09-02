const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const configuredLevel = (process.env.LOG_LEVEL || "info").toLowerCase();

function log(level, message) {
  if (LEVELS[level] > LEVELS[configuredLevel]) return;

  const timestamp = new Date().toISOString();
  const method = level === "debug" ? "log" : level;
  // eslint-disable-next-line no-console
  console[method](`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}

/** Minimal dependency-free logger used across the server. */
export const logger = {
  error: (message) => log("error", message),
  warn: (message) => log("warn", message),
  info: (message) => log("info", message),
  debug: (message) => log("debug", message),
};
