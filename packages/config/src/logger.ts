export interface LoggerContext {
  [key: string]: unknown;
}

function formatMessage(level: string, message: string, error?: unknown, context?: LoggerContext) {
  const payload: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  if (error) {
    if (error instanceof Error) {
      payload.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else {
      payload.error = error;
    }
  }

  // Se estivermos em desenvolvimento, imprime um log mais legível.
  // Em produção, usa JSON puro para indexação do stdout.
  if (process.env.NODE_ENV === 'development') {
    const errorMsg = error instanceof Error ? `\n${error.stack}` : error ? `\n${JSON.stringify(error)}` : '';
    return `[${payload.timestamp}] [${level}] ${message} ${context ? JSON.stringify(context) : ''}${errorMsg}`;
  }

  return JSON.stringify(payload);
}

export const logger = {
  info(message: string, context?: LoggerContext) {
    console.log(formatMessage('INFO', message, undefined, context));
  },
  warn(message: string, error?: unknown, context?: LoggerContext) {
    console.warn(formatMessage('WARN', message, error, context));
  },
  error(message: string, error?: unknown, context?: LoggerContext) {
    console.error(formatMessage('ERROR', message, error, context));
  },
  debug(message: string, context?: LoggerContext) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatMessage('DEBUG', message, undefined, context));
    }
  }
};
