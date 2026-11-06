import {
  CreatedIssue,
  CreateIssueInput,
  GithubIssueTransport,
} from '../src/bug-reports/github/github-issue.transport';

// A controllable double for e2e tests: enabled by default, creates
// successfully with an increasing issue number unless told to fail.
export class FakeGithubIssueTransport extends GithubIssueTransport {
  enabled = true;
  readonly created: CreateIssueInput[] = [];
  private nextNumber = 1;
  private failNext = false;

  createIssue(input: CreateIssueInput): Promise<CreatedIssue> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('GitHub answered 500'));
    }
    this.created.push(input);
    return Promise.resolve({ number: this.nextNumber++ });
  }

  failOnce(): void {
    this.failNext = true;
  }

  reset(): void {
    this.enabled = true;
    this.created.length = 0;
    this.nextNumber = 1;
    this.failNext = false;
  }
}
