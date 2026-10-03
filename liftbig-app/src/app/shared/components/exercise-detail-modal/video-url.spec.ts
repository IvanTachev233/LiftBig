import { isHttpsUrl, parseVideoUrl } from './video-url';

describe('parseVideoUrl', () => {
  const ytId = 'dQw4w9WgXcQ';

  it('returns null for empty, missing or non-https values', () => {
    expect(parseVideoUrl(undefined)).toBeNull();
    expect(parseVideoUrl(null)).toBeNull();
    expect(parseVideoUrl('')).toBeNull();
    expect(parseVideoUrl('   ')).toBeNull();
    expect(parseVideoUrl('not a url')).toBeNull();
    expect(parseVideoUrl(`http://www.youtube.com/watch?v=${ytId}`)).toBeNull();
    expect(parseVideoUrl('javascript:alert(1)')).toBeNull();
    expect(parseVideoUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('parses YouTube watch, short, embed and shorts links', () => {
    for (const url of [
      `https://www.youtube.com/watch?v=${ytId}`,
      `https://youtube.com/watch?v=${ytId}&t=42s`,
      `https://m.youtube.com/watch?v=${ytId}`,
      `https://youtu.be/${ytId}`,
      `https://youtu.be/${ytId}?si=abc`,
      `https://www.youtube.com/embed/${ytId}`,
      `https://www.youtube.com/shorts/${ytId}`,
    ]) {
      expect(parseVideoUrl(url)).withContext(url).toEqual({ kind: 'youtube', id: ytId });
    }
  });

  it('parses Vimeo page and player links', () => {
    expect(parseVideoUrl('https://vimeo.com/76979871')).toEqual({ kind: 'vimeo', id: '76979871' });
    expect(parseVideoUrl('https://www.vimeo.com/76979871')).toEqual({ kind: 'vimeo', id: '76979871' });
    expect(parseVideoUrl('https://player.vimeo.com/video/76979871')).toEqual({
      kind: 'vimeo',
      id: '76979871',
    });
  });

  it('does not embed a YouTube or Vimeo link whose id fails the strict pattern', () => {
    const badIds = [
      'https://www.youtube.com/watch?v=short',
      `https://www.youtube.com/watch?v=${ytId}"onload="x`,
      'https://youtu.be/abc/../../evil',
      'https://vimeo.com/channels/staffpicks',
      'https://player.vimeo.com/video/123abc',
    ];
    for (const url of badIds) {
      const parsed = parseVideoUrl(url);
      expect(parsed?.kind).withContext(url).toBe('link');
    }
  });

  it('does not treat look-alike hosts as YouTube or Vimeo', () => {
    for (const url of [
      `https://youtube.com.evil.example/watch?v=${ytId}`,
      `https://evilyoutube.com/watch?v=${ytId}`,
      `https://youtu.be.evil.example/${ytId}`,
      'https://vimeo.com.evil.example/76979871',
    ]) {
      expect(parseVideoUrl(url)?.kind).withContext(url).toBe('link');
    }
  });

  it('recognises direct .mp4, .webm and .mov files (ignoring case and query)', () => {
    expect(parseVideoUrl('https://cdn.example.com/lifts/squat.mp4')).toEqual({
      kind: 'file',
      url: 'https://cdn.example.com/lifts/squat.mp4',
    });
    expect(parseVideoUrl('https://cdn.example.com/a.WEBM?token=1')?.kind).toBe('file');
    expect(parseVideoUrl('https://cdn.example.com/a.mov')?.kind).toBe('file');
  });

  it('turns any other https URL into a link', () => {
    expect(parseVideoUrl('https://evil.example/x')).toEqual({
      kind: 'link',
      url: 'https://evil.example/x',
    });
  });
});

describe('isHttpsUrl', () => {
  it('accepts https URLs with a host', () => {
    expect(isHttpsUrl('https://youtu.be/dQw4w9WgXcQ')).toBeTrue();
    expect(isHttpsUrl('  https://example.com/video.mp4 ')).toBeTrue();
  });

  it('rejects http, other schemes and garbage', () => {
    expect(isHttpsUrl('http://example.com')).toBeFalse();
    expect(isHttpsUrl('javascript:alert(1)')).toBeFalse();
    expect(isHttpsUrl('ftp://example.com/a.mp4')).toBeFalse();
    expect(isHttpsUrl('example.com/video')).toBeFalse();
    expect(isHttpsUrl('')).toBeFalse();
  });
});
