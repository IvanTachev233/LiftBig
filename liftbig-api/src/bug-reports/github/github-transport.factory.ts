import { DEFAULT_GITHUB_FEEDBACK_REPO } from '../bug-report-limits';
import { DisabledGithubIssueTransport } from './disabled-github-issue.transport';
import { FetchGithubIssueTransport } from './fetch-github-issue.transport';
import { GithubIssueTransport } from './github-issue.transport';

// fetch when GITHUB_FEEDBACK_TOKEN is set, else disabled (no call, status
// `disabled`). GITHUB_FEEDBACK_REPO defaults to the private feedback repo.
export function createGithubIssueTransport(
  env: (name: string) => string | undefined,
): GithubIssueTransport {
  const token = env('GITHUB_FEEDBACK_TOKEN');
  if (!token) return new DisabledGithubIssueTransport();
  const repo = env('GITHUB_FEEDBACK_REPO') || DEFAULT_GITHUB_FEEDBACK_REPO;
  return new FetchGithubIssueTransport(token, repo);
}
