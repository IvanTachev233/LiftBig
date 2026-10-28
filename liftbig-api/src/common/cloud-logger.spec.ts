import { CloudLogger } from './cloud-logger';

describe('CloudLogger', () => {
  let stdout: string[];
  let stderr: string[];

  beforeEach(() => {
    stdout = [];
    stderr = [];
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });
    jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Each entry is one line of JSON
  const entries = (lines: string[]) =>
    lines.map((line) => {
      expect(line.endsWith('\n')).toBe(true);
      expect(line.slice(0, -1)).not.toContain('\n');
      return JSON.parse(line) as Record<string, unknown>;
    });

  it('writes a log line as JSON with severity, message, context and time', () => {
    new CloudLogger().log('Nest application successfully started', 'Boot');

    const [entry] = entries(stdout);
    expect(entry).toEqual({
      severity: 'INFO',
      message: 'Nest application successfully started',
      context: 'Boot',
      time: expect.stringMatching(
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/,
      ) as string,
      pid: process.pid,
    });
    expect(stderr).toEqual([]);
  });

  it.each([
    ['warn', 'WARNING'],
    ['debug', 'DEBUG'],
    ['verbose', 'DEBUG'],
  ] as const)('maps %s to %s', (level, severity) => {
    new CloudLogger()[level]('message');

    expect(entries(stdout)).toEqual([
      expect.objectContaining({ severity, message: 'message' }),
    ]);
  });

  it('writes errors to stderr with the stack in stack_trace', () => {
    const stack = new Error('Mail request failed').stack;

    new CloudLogger().error('Mail request failed', stack, 'Mail');

    const [entry] = entries(stderr);
    expect(entry).toMatchObject({
      severity: 'ERROR',
      message: 'Mail request failed',
      context: 'Mail',
      stack_trace: stack,
    });
    expect(entry).not.toHaveProperty('stack');
    expect(stdout).toEqual([]);
  });

  it('keeps the stack trace of a logged Error in message', () => {
    // How Nest's exception filter logs an unhandled exception
    new CloudLogger().error(new Error('boom'), 'ExceptionsHandler');

    const [entry] = entries(stderr);
    expect(entry.severity).toBe('ERROR');
    expect(entry.message).toMatch(/^Error: boom\n\s+at /);
    // Only an explicit stack argument fills stack_trace
    expect(entry).not.toHaveProperty('stack_trace');
  });

  it('maps fatal to CRITICAL', () => {
    new CloudLogger().fatal('out of memory');

    expect(entries([...stdout, ...stderr])).toEqual([
      expect.objectContaining({ severity: 'CRITICAL' }),
    ]);
  });

  it('drops the fields Cloud Logging would misread', () => {
    new CloudLogger().log('message');

    const [entry] = entries(stdout);
    expect(entry).not.toHaveProperty('level');
    expect(entry).not.toHaveProperty('timestamp');
  });
});
