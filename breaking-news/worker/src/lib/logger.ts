import pino from 'pino';

const LOG_LEVEL = process.env['LOG_LEVEL'] || 'info';

export const logger = pino({
  level: LOG_LEVEL,
  transport:
    process.env['NODE_ENV'] === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  base: {
    service: 'breaking-news-worker',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function createChildLogger(name: string) {
  return logger.child({ worker: name });
}

export default logger;
