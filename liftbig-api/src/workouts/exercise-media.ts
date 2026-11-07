// Demo media for global exercises (ADR 0026): exercises.json and the
// exercise table hold object keys in a public bucket, and the API turns a key
// into a URL from EXERCISE_MEDIA_BASE_URL when it answers, so staging and
// production can use different buckets and the host can change without a
// data migration.

export type MediaKind = 'video' | 'image';

const EXTENSIONS: Record<MediaKind, readonly string[]> = {
  video: ['.mp4', '.webm'],
  image: ['.jpg', '.png', '.webp'],
};

// Lower-case letters, digits, '-', '_' and '.', in '/'-separated parts
const KEY_CHARS = /^[a-z0-9/_.-]+$/;

/**
 * The base URL demo keys are appended to, without a trailing slash; null
 * when EXERCISE_MEDIA_BASE_URL is unset, blank or not an https URL, so a key
 * then gives no media.
 */
export function exerciseMediaBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = env.EXERCISE_MEDIA_BASE_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname === '') return null;
  } catch {
    return null;
  }
  return value.replace(/\/+$/, '');
}

export function exerciseMediaUrl(
  key: string | null,
  base: string | null,
): string | null {
  return key && base ? `${base}/${key}` : null;
}

/**
 * Why a demo key can't be used, or null when it can: a relative object key
 * such as exercises/snatch-v1.mp4, never a URL or a path that leaves the
 * bucket, ending in a file type the app can show.
 */
export function mediaKeyProblem(key: unknown, kind: MediaKind): string | null {
  const types = EXTENSIONS[kind];
  const typeList = `${types.slice(0, -1).join(', ')} or ${types[types.length - 1]}`;
  if (typeof key !== 'string') return 'must be text';
  if (key === '') return 'must not be empty';
  if (/^[a-z][a-z0-9+.-]*:/i.test(key)) {
    return 'is a URL; give the object key, e.g. exercises/snatch-v1.mp4';
  }
  if (key.startsWith('/')) return 'must not start with /';
  if (key.includes('..')) return 'must not contain ..';
  if (key.includes('//')) return 'must not contain //';
  if (key !== key.toLowerCase() && KEY_CHARS.test(key.toLowerCase())) {
    return 'must be lower-case';
  }
  if (!KEY_CHARS.test(key)) {
    return "may use only lower-case letters, digits, '-', '_', '.' and '/'";
  }
  if (!types.some((type) => key.endsWith(type))) {
    return `must end in ${typeList}`;
  }
  return null;
}
