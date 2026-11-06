import { BugReportPlatform } from '../bug-report.entity';
import { ISSUE_TITLE_MAX_LENGTH } from '../bug-report-limits';

// Same rule the app's error reports use for Sentry (liftbig-app's
// src/app/core/sentry.ts): emails and JWT-shaped strings never leave the
// device/server in a report. Kept in sync with that file; see notes/spec.md
// § LB-38 GitHub issue.
const EMAIL = /[^\s@"'<>()[\]{},;:]+@[^\s@"'<>()[\]{},;:]+\.[a-z]{2,}/gi;
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;

/** Masks emails and JWT-shaped strings in report text before it reaches GitHub */
export function scrubIdentity(text: string): string {
  return text.replace(JWT, '[token]').replace(EMAIL, '[email]');
}

export interface IssueContext {
  description: string;
  steps: string | null;
  appVersion: string | null;
  versionCode: number | null;
  platform: BugReportPlatform;
  osVersion: string | null;
  deviceModel: string | null;
  role: string;
  reportId: string;
  screenshotNames: string[];
  /** The bucket screenshots live in; null when none is configured */
  bucketName: string | null;
}

/** `Bug: ` plus the description's first line, cut to 70 characters total */
export function buildIssueTitle(description: string): string {
  const firstLine = scrubIdentity(description).split('\n')[0].trim();
  return `Bug: ${firstLine}`.slice(0, ISSUE_TITLE_MAX_LENGTH);
}

/** One Cloud Console link per screenshot (Ivan's Google sign-in needed; no public/signed link) */
export function consoleLink(bucketName: string, objectName: string): string {
  return `https://console.cloud.google.com/storage/browser/_details/${bucketName}/${objectName}`;
}

export function buildIssueBody(context: IssueContext): string {
  const description = scrubIdentity(context.description);
  const steps = context.steps ? scrubIdentity(context.steps) : null;
  const lines: string[] = ['## Description', '', description, ''];

  if (steps) lines.push('## Steps to reproduce', '', steps, '');

  lines.push(
    '## Context',
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Version | ${context.appVersion ?? '-'} (build ${context.versionCode ?? '-'}) |`,
    `| Platform | ${context.platform} |`,
    `| OS | ${context.osVersion ?? '-'} |`,
    `| Device | ${context.deviceModel ?? '-'} |`,
    `| Role | ${context.role} |`,
    '',
    `Report id: ${context.reportId}`,
    '',
  );

  if (context.screenshotNames.length === 0 || !context.bucketName) {
    lines.push('Screenshots not stored.');
  } else {
    lines.push('## Screenshots', '');
    for (const name of context.screenshotNames) {
      lines.push(`- ${consoleLink(context.bucketName, name)}`);
    }
  }

  return lines.join('\n');
}

export function buildIssueLabels(platform: BugReportPlatform | null): string[] {
  const labels = ['bug', 'needs-triage'];
  if (platform) labels.push(`platform:${platform}`);
  return labels;
}
