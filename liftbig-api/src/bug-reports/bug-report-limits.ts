// Named constants for LB-38 (see notes/spec.md § LB-38); the values marked
// *(assumption)* there are Ivan's to confirm, hence names rather than
// literals scattered through the module.

/** Per screenshot *(assumption)* */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * multer's own limit, well above MAX_FILE_SIZE_BYTES: a memory-use guard
 * only. The real 5 MB check runs in BugReportsService and answers 400;
 * multer's fileSize limit would otherwise answer 413.
 */
export const MULTER_FILE_SIZE_SAFETY_BYTES = 20 * 1024 * 1024;

export const MAX_FILES = 3;

/** Reports per account in any rolling window *(assumption)* */
export const MAX_REPORTS_PER_WINDOW = 5;

export const WINDOW_HOURS = 24;

export const DESCRIPTION_MIN_LENGTH = 10;
export const DESCRIPTION_MAX_LENGTH = 2000;
export const STEPS_MAX_LENGTH = 2000;
export const CONTEXT_FIELD_MAX_LENGTH = 100;

export const GITHUB_TIMEOUT_MS = 10_000;
export const ISSUE_TITLE_MAX_LENGTH = 70;

export const DEFAULT_GITHUB_FEEDBACK_REPO = 'IvanTachev233/LiftBig-Feedback';
