import {
  buildIssueBody,
  buildIssueLabels,
  buildIssueTitle,
  consoleLink,
  scrubIdentity,
  IssueContext,
} from './issue-builder';

const baseContext: IssueContext = {
  description: 'The app crashes on launch',
  steps: null,
  appVersion: '1.2.3',
  versionCode: 42,
  platform: 'android',
  osVersion: '15',
  deviceModel: 'Pixel 9 Pro',
  role: 'CLIENT',
  reportId: 'report-1',
  screenshotNames: [],
  bucketName: null,
};

describe('scrubIdentity', () => {
  it('masks an email address', () => {
    expect(scrubIdentity('contact me at a@b.co please')).toBe(
      'contact me at [email] please',
    );
  });

  it('masks a JWT-shaped string', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc123_-xyz';
    expect(scrubIdentity(`token ${jwt} expired`)).toBe('token [token] expired');
  });

  it('leaves ordinary text alone', () => {
    expect(scrubIdentity('nothing sensitive here')).toBe(
      'nothing sensitive here',
    );
  });
});

describe('buildIssueTitle', () => {
  it('prefixes with "Bug: " and uses only the first line', () => {
    expect(buildIssueTitle('Crashes on launch\nMore detail here')).toBe(
      'Bug: Crashes on launch',
    );
  });

  it('cuts the whole title to 70 characters', () => {
    const longLine = 'x'.repeat(100);
    const title = buildIssueTitle(longLine);
    expect(title.length).toBe(70);
    expect(title.startsWith('Bug: ')).toBe(true);
  });

  it('scrubs identity out of the title', () => {
    expect(buildIssueTitle('Failed for a@b.co')).toBe(
      'Bug: Failed for [email]',
    );
  });
});

describe('buildIssueLabels', () => {
  it('always includes bug and needs-triage', () => {
    expect(buildIssueLabels(null)).toEqual(['bug', 'needs-triage']);
  });

  it('adds a platform label when platform is known', () => {
    expect(buildIssueLabels('ios')).toEqual([
      'bug',
      'needs-triage',
      'platform:ios',
    ]);
  });
});

describe('consoleLink', () => {
  it('builds the Cloud Console object link', () => {
    expect(consoleLink('my-bucket', 'report-1/1.jpg')).toBe(
      'https://console.cloud.google.com/storage/browser/_details/my-bucket/report-1/1.jpg',
    );
  });
});

describe('buildIssueBody', () => {
  it('has the description, context table and report id, no identity', () => {
    const body = buildIssueBody({
      ...baseContext,
      description: 'Crashes for user@example.com every time',
    });
    expect(body).toContain('Crashes for [email] every time');
    expect(body).toContain('| Version | 1.2.3 (build 42) |');
    expect(body).toContain('| Platform | android |');
    expect(body).toContain('| OS | 15 |');
    expect(body).toContain('| Device | Pixel 9 Pro |');
    expect(body).toContain('| Role | CLIENT |');
    expect(body).toContain('Report id: report-1');
    expect(body).not.toContain('@example.com');
  });

  it('includes steps, scrubbed, when present', () => {
    const body = buildIssueBody({
      ...baseContext,
      steps: 'Open the app as a@b.co',
    });
    expect(body).toContain('## Steps to reproduce');
    expect(body).toContain('Open the app as [email]');
  });

  it('omits the steps section when there are none', () => {
    const body = buildIssueBody(baseContext);
    expect(body).not.toContain('Steps to reproduce');
  });

  it('says screenshots are not stored when there is no bucket', () => {
    const body = buildIssueBody({ ...baseContext, screenshotNames: [] });
    expect(body).toContain('Screenshots not stored.');
  });

  it('links one Console URL per screenshot when a bucket is configured', () => {
    const body = buildIssueBody({
      ...baseContext,
      screenshotNames: ['report-1/1.jpg', 'report-1/2.png'],
      bucketName: 'my-bucket',
    });
    expect(body).toContain(
      'https://console.cloud.google.com/storage/browser/_details/my-bucket/report-1/1.jpg',
    );
    expect(body).toContain(
      'https://console.cloud.google.com/storage/browser/_details/my-bucket/report-1/2.png',
    );
    expect(body).not.toContain('Screenshots not stored.');
  });

  it('never contains an account id, email or name', () => {
    const body = buildIssueBody({
      ...baseContext,
      description: 'My account id abc-123 and email test@liftbig.com failed',
    });
    expect(body).not.toContain('test@liftbig.com');
  });
});
