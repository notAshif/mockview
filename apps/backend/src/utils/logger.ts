type LogLevel = "info" | "warn" | "error" | "debug";

interface LogPayload {
  message: string;
  [key: string]: unknown;
}

const log = (level: LogLevel, payload: LogPayload): void => {
  const entry = {
    ts: new Date().toISOString(),
    level,
    ...payload,
  };
  const output = JSON.stringify(entry);
  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
};

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) =>
    log("info", { message, ...meta }),
  warn: (message: string, meta?: Record<string, unknown>) =>
    log("warn", { message, ...meta }),
  error: (message: string, meta?: Record<string, unknown>) =>
    log("error", { message, ...meta }),
  debug: (message: string, meta?: Record<string, unknown>) =>
    log("debug", { message, ...meta }),
};
