import { ConsoleLogger, LogLevel } from '@nestjs/common';

const SEVERITY: Record<LogLevel, string> = {
  verbose: 'DEBUG',
  debug: 'DEBUG',
  log: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

// Nest's JSON logger in the shape Cloud Run reads: one line per entry, with
// `severity` (Cloud Logging's level), `time` as ISO 8601 and a separate stack
// in `stack_trace`, where Error Reporting looks for it. A logged Error keeps
// its stack trace in `message`, which Error Reporting reads as well.
export class CloudLogger extends ConsoleLogger {
  constructor() {
    super({ json: true });
  }

  protected stringifyJsonLogObject(logObject: Record<string, unknown>): string {
    const { level, timestamp, stack, ...rest } = logObject;
    return super.stringifyJsonLogObject({
      severity: SEVERITY[level as LogLevel],
      time: new Date(timestamp as number).toISOString(),
      ...rest,
      ...(stack !== undefined && { stack_trace: stack }),
    });
  }
}
