import { GithubIssueTransport } from './github-issue.transport';

// No GITHUB_FEEDBACK_TOKEN: never calls out; BugReportsService sets status
// `disabled` without calling createIssue, but this throws if it ever is.
export class DisabledGithubIssueTransport extends GithubIssueTransport {
  readonly enabled = false;

  createIssue(): never {
    throw new Error('The GitHub transport is disabled (no token configured)');
  }
}
