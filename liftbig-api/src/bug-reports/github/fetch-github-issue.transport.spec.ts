import { FetchGithubIssueTransport } from './fetch-github-issue.transport';

describe('FetchGithubIssueTransport', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('is enabled', () => {
    expect(new FetchGithubIssueTransport('t', 'o/r').enabled).toBe(true);
  });

  it('posts to the repo issues endpoint with the right headers and body', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ number: 42 }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const transport = new FetchGithubIssueTransport('secret-token', 'o/r');
    const result = await transport.createIssue({
      title: 'Bug: x',
      body: 'body',
      labels: ['bug', 'needs-triage'],
    });

    expect(result).toEqual({ number: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/o/r/issues');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: 'Bearer secret-token',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      title: 'Bug: x',
      body: 'body',
      labels: ['bug', 'needs-triage'],
    });
  });

  it('rejects with `failed` on a non-2xx answer', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const transport = new FetchGithubIssueTransport('t', 'o/r');
    await expect(
      transport.createIssue({ title: 't', body: 'b', labels: [] }),
    ).rejects.toThrow(/500/);
  });

  it('rejects on a network error or timeout', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('timed out')) as unknown as typeof fetch;
    const transport = new FetchGithubIssueTransport('t', 'o/r');
    await expect(
      transport.createIssue({ title: 't', body: 'b', labels: [] }),
    ).rejects.toThrow();
  });
});
