import {
  exerciseMediaBaseUrl,
  exerciseMediaUrl,
  mediaKeyProblem,
} from './exercise-media';

describe('exerciseMediaBaseUrl', () => {
  const base = (value?: string) =>
    exerciseMediaBaseUrl({ EXERCISE_MEDIA_BASE_URL: value });

  it('reads EXERCISE_MEDIA_BASE_URL, without a trailing slash', () => {
    expect(base('https://storage.googleapis.com/liftbigapi-media')).toBe(
      'https://storage.googleapis.com/liftbigapi-media',
    );
    expect(base(' https://media.liftbig.co/ ')).toBe(
      'https://media.liftbig.co',
    );
  });

  it.each([
    ['unset', undefined],
    ['blank', '  '],
    ['plain http', 'http://storage.googleapis.com/liftbigapi-media'],
    ['not a URL', 'storage.googleapis.com/liftbigapi-media'],
    ['an https URL with no host', 'https://'],
  ])('is null when %s', (_, value) => {
    expect(base(value)).toBeNull();
  });
});

describe('exerciseMediaUrl', () => {
  const base = 'https://storage.googleapis.com/liftbigapi-media';

  it('joins the base and the key', () => {
    expect(exerciseMediaUrl('exercises/snatch-v1.mp4', base)).toBe(
      'https://storage.googleapis.com/liftbigapi-media/exercises/snatch-v1.mp4',
    );
  });

  it('is null without a key or without a base', () => {
    expect(exerciseMediaUrl(null, base)).toBeNull();
    expect(exerciseMediaUrl('exercises/snatch-v1.mp4', null)).toBeNull();
  });
});

describe('mediaKeyProblem', () => {
  it.each([
    ['video', 'exercises/snatch-v1.mp4'],
    ['video', 'exercises/snatch-v1.webm'],
    ['video', 'snatch.mp4'],
    ['image', 'exercises/snatch-v1.jpg'],
    ['image', 'exercises/snatch-v1.png'],
    ['image', 'exercises/snatch_v1.webp'],
  ] as const)('accepts the %s key %s', (kind, key) => {
    expect(mediaKeyProblem(key, kind)).toBeNull();
  });

  it.each([
    ['a leading /', 'video', '/exercises/snatch-v1.mp4', /start with/],
    ['..', 'video', 'exercises/../snatch-v1.mp4', /\.\./],
    [
      'a URL',
      'video',
      'https://storage.googleapis.com/liftbigapi-media/snatch.mp4',
      /URL/,
    ],
    ['a .mov video', 'video', 'exercises/snatch-v1.mov', /\.mp4 or \.webm/],
    ['an image as video', 'video', 'exercises/snatch-v1.jpg', /\.mp4/],
    ['a .gif image', 'image', 'exercises/snatch-v1.gif', /\.jpg, \.png/],
    ['a video as image', 'image', 'exercises/snatch-v1.mp4', /\.webp/],
    ['an empty key', 'video', '', /empty/],
    ['a space', 'video', 'exercises/snatch v1.mp4', /letters/],
    ['upper case', 'video', 'exercises/Snatch-v1.mp4', /lower-case/],
    ['an empty folder', 'video', 'exercises//snatch-v1.mp4', /\/\//],
    ['a backslash', 'video', 'exercises\\snatch-v1.mp4', /letters/],
    ['a non-string', 'image', 42, /text/],
  ] as const)('rejects %s', (_, kind, key, problem) => {
    expect(mediaKeyProblem(key, kind)).toMatch(problem);
  });
});
