import { DisabledGithubIssueTransport } from './disabled-github-issue.transport';
import { FetchGithubIssueTransport } from './fetch-github-issue.transport';
import { createGithubIssueTransport } from './github-transport.factory';

const env =
  (values: Record<string, string>) =>
  (name: string): string | undefined =>
    values[name];

describe('createGithubIssueTransport', () => {
  it('is disabled without a token', () => {
    const transport = createGithubIssueTransport(env({}));
    expect(transport).toBeInstanceOf(DisabledGithubIssueTransport);
    expect(transport.enabled).toBe(false);
  });

  it('uses fetch with the configured repo when a token is set', () => {
    const transport = createGithubIssueTransport(
      env({ GITHUB_FEEDBACK_TOKEN: 't', GITHUB_FEEDBACK_REPO: 'me/my-repo' }),
    );
    expect(transport).toBeInstanceOf(FetchGithubIssueTransport);
    expect(transport.enabled).toBe(true);
  });

  it('defaults the repo to IvanTachev233/LiftBig-Feedback', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ number: 1 }),
    });
    (global as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    const transport = createGithubIssueTransport(
      env({ GITHUB_FEEDBACK_TOKEN: 't' }),
    );
    await transport.createIssue({ title: 't', body: 'b', labels: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/IvanTachev233/LiftBig-Feedback/issues',
      expect.anything(),
    );
  });
});

describe('DisabledGithubIssueTransport', () => {
  it('throws rather than calling out', () => {
    expect(() => new DisabledGithubIssueTransport().createIssue()).toThrow();
  });
});
