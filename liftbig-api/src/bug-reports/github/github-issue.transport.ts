export interface CreateIssueInput {
  title: string;
  body: string;
  labels: string[];
}

export interface CreatedIssue {
  number: number;
}

/** Creates the GitHub issue for a report; also the injection token. */
export abstract class GithubIssueTransport {
  /** False without a token (GITHUB_FEEDBACK_TOKEN unset): status `disabled`, no call */
  abstract readonly enabled: boolean;

  abstract createIssue(input: CreateIssueInput): Promise<CreatedIssue>;
}
