import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: {
    env: process.env.VERCEL_ENV || "local"
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "process.env.STACKSPOT_JWT",
      "process.env.STACKSPOT_CLIENT_SECRET",
      "process.env.TELEGRAM_BOT_TOKEN"
    ],
    censor: "[REDACTED]"
  }
});

export default logger;
