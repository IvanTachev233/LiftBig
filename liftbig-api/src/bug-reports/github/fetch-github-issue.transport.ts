import { Logger } from '@nestjs/common';
import { GITHUB_TIMEOUT_MS } from '../bug-report-limits';
import {
  CreatedIssue,
  CreateIssueInput,
  GithubIssueTransport,
} from './github-issue.transport';

// Creates the issue with GitHub's REST API (docs.github.com, "Create an
// issue"). Any non-2xx answer, network error or timeout rejects; the log
// gets the status and reason, never the report text or the token.
export class FetchGithubIssueTransport extends GithubIssueTransport {
  readonly enabled = true;
  private readonly logger = new Logger('BugReports');

  constructor(
    private readonly token: string,
    private readonly repo: string,
  ) {
    super();
  }

  async createIssue(input: CreateIssueInput): Promise<CreatedIssue> {
    let response: Response;
    try {
      response = await fetch(
        `https://api.github.com/repos/${this.repo}/issues`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
        },
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`GitHub issue request failed: ${reason}`);
      throw new Error('GitHub issue request failed');
    }

    if (!response.ok) {
      this.logger.error(`GitHub answered ${response.status} creating an issue`);
      throw new Error(`GitHub answered ${response.status}`);
    }

    const body = (await response.json()) as { number: number };
    return { number: body.number };
  }
}
