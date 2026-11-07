import { BodyPart, Exercise } from './exercise.entity';

// What the API sends for an exercise (ADR 0026): JSON.stringify, as Express
// does, turns a global's media keys into URLs and leaves the keys out.
const BASE = 'https://storage.googleapis.com/liftbigapi-media';

function exercise(fields: Partial<Exercise>): Exercise {
  return Object.assign(new Exercise(), {
    id: 'e1',
    name: 'Snatch',
    bodyPart: BodyPart.FULL_BODY,
    createdById: null,
    videoUrl: null,
    imageUrl: null,
    videoKey: null,
    imageKey: null,
    ...fields,
  });
}

const sent = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

describe('Exercise as the API sends it', () => {
  const setting = process.env.EXERCISE_MEDIA_BASE_URL;
  afterEach(() => {
    if (setting === undefined) delete process.env.EXERCISE_MEDIA_BASE_URL;
    else process.env.EXERCISE_MEDIA_BASE_URL = setting;
  });

  const keyed = () =>
    exercise({
      videoKey: 'exercises/snatch-v1.mp4',
      imageKey: 'exercises/snatch-v1.webp',
    });

  it('sends a key as a URL under EXERCISE_MEDIA_BASE_URL, and never the keys', () => {
    process.env.EXERCISE_MEDIA_BASE_URL = `${BASE}/`;
    const body = sent(keyed());
    expect(body).toMatchObject({
      id: 'e1',
      name: 'Snatch',
      videoUrl: `${BASE}/exercises/snatch-v1.mp4`,
      imageUrl: `${BASE}/exercises/snatch-v1.webp`,
    });
    expect(body).not.toHaveProperty('videoKey');
    expect(body).not.toHaveProperty('imageKey');
  });

  it('sends no media for a key when EXERCISE_MEDIA_BASE_URL is unset', () => {
    delete process.env.EXERCISE_MEDIA_BASE_URL;
    expect(sent(keyed())).toMatchObject({ videoUrl: null, imageUrl: null });
  });

  it("sends a coach's own link as it is", () => {
    process.env.EXERCISE_MEDIA_BASE_URL = BASE;
    const own = exercise({
      createdById: 'coach-1',
      videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    });
    expect(sent(own)).toMatchObject({
      videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      imageUrl: null,
    });
  });

  it('applies inside other responses too', () => {
    process.env.EXERCISE_MEDIA_BASE_URL = BASE;
    const card = sent({ order: 1, exercise: keyed() });
    expect(card.exercise).toMatchObject({
      videoUrl: `${BASE}/exercises/snatch-v1.mp4`,
    });
  });
});
