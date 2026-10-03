export type ParsedVideo =
  | { kind: 'youtube'; id: string }
  | { kind: 'vimeo'; id: string }
  | { kind: 'file'; url: string }
  | { kind: 'link'; url: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d+$/;
const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com'];
const VIMEO_HOSTS = ['vimeo.com', 'www.vimeo.com'];
const VIDEO_FILE = /\.(mp4|webm|mov)$/i;

function parseHttps(value: string | null | undefined): URL | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' && url.hostname ? url : null;
  } catch {
    return null;
  }
}

export function isHttpsUrl(value: string | null | undefined): boolean {
  return parseHttps(value) !== null;
}

/**
 * Classifies an exercise video URL. Only ids that pass the strict patterns
 * are returned for YouTube/Vimeo, so callers build the embed URL themselves
 * and never bind the raw value to an iframe. Non-https values give null.
 */
export function parseVideoUrl(value: string | null | undefined): ParsedVideo | null {
  const url = parseHttps(value);
  if (!url) return null;

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);
  let id: string | null = null;

  if (YOUTUBE_HOSTS.includes(host)) {
    if (url.pathname === '/watch') {
      id = url.searchParams.get('v');
    } else if (segments.length === 2 && ['embed', 'shorts'].includes(segments[0])) {
      id = segments[1];
    }
    if (id && YOUTUBE_ID.test(id)) return { kind: 'youtube', id };
  } else if (host === 'youtu.be') {
    id = segments.length === 1 ? segments[0] : null;
    if (id && YOUTUBE_ID.test(id)) return { kind: 'youtube', id };
  } else if (VIMEO_HOSTS.includes(host)) {
    id = segments[0] ?? null;
    if (id && VIMEO_ID.test(id)) return { kind: 'vimeo', id };
  } else if (host === 'player.vimeo.com') {
    id = segments.length === 2 && segments[0] === 'video' ? segments[1] : null;
    if (id && VIMEO_ID.test(id)) return { kind: 'vimeo', id };
  } else if (VIDEO_FILE.test(url.pathname)) {
    return { kind: 'file', url: url.href };
  }

  return { kind: 'link', url: url.href };
}
