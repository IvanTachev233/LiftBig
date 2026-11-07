import { EXERCISE_CATEGORIES } from '../../common/exercise-categories';
import { BodyPart } from '../../workouts/entities/exercise.entity';
import schema from './exercises.schema.json';
import exercisesFile from './exercises.json';
import { SAMPLE_PROGRAMS, SEED_SPORTS } from './seed-data';
import { parseSeedExercises, SEED_EXERCISE_LIST } from './seed-exercises';

// The names migration 0001 seeded; the Baseline still inserts them.
const BASELINE_NAMES = [
  'Clean',
  'Jerk',
  'Clean and Jerk',
  'Power Clean',
  'Power Jerk',
  'Power Clean and Jerk',
  'Power Clean and Power Jerk',
  'Snatch',
  'Power Snatch',
  'Clean Pull',
  'Snatch Pull',
  'Back Squat',
  'Front Squat',
];

// Seeded with no category: the picker lists them under "Other" (A6f).
const OTHER_NAMES = [
  'Hip Thrust',
  'Back Extension',
  'Hanging Leg Raise',
  'Plank',
  'Barbell Curl',
  'Triceps Pushdown',
  "Farmer's Carry",
];

const valid = {
  name: 'Back Squat',
  bodyPart: 'LEGS',
  category: 'Squat',
  equipment: 'Barbell',
};

// Shipped entries carry no video or image yet
const noMedia = { videoKey: null, imageKey: null };

const programExerciseNames = () => {
  const names = new Set<string>();
  for (const program of SAMPLE_PROGRAMS) {
    program.build('sport', (name) => {
      names.add(name);
      return name;
    });
  }
  return names;
};

describe('seed exercise file', () => {
  const byName = new Map(SEED_EXERCISE_LIST.map((e) => [e.name, e]));

  it('loads, with each name once whatever its case', () => {
    const lower = SEED_EXERCISE_LIST.map((e) => e.name.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
    expect(SEED_EXERCISE_LIST.length).toBe(60);
  });

  it('has every exercise the sports, sample programs and Baseline use', () => {
    const needed = [
      ...SEED_SPORTS.flatMap((s) => s.lifts.map(([, name]) => name)),
      ...programExerciseNames(),
      ...BASELINE_NAMES,
    ];
    for (const name of needed)
      expect([name, byName.has(name)]).toEqual([name, true]);
  });

  it('keeps the body part, category and equipment of existing globals', () => {
    expect(byName.get('Back Squat')).toEqual({
      name: 'Back Squat',
      bodyPart: BodyPart.LEGS,
      category: 'Squat',
      equipment: 'Barbell',
      ...noMedia,
    });
    expect(byName.get('Power Clean and Power Jerk')).toEqual({
      name: 'Power Clean and Power Jerk',
      bodyPart: BodyPart.FULL_BODY,
      category: 'Olympic',
      equipment: 'Barbell',
      ...noMedia,
    });
  });

  it('adds the approved exercises, the accessories with no category', () => {
    expect(byName.get('Romanian Deadlift')).toEqual({
      name: 'Romanian Deadlift',
      bodyPart: BodyPart.LEGS,
      category: 'Pull',
      equipment: 'Barbell',
      ...noMedia,
    });
    expect(byName.get('Lat Pulldown')).toMatchObject({ equipment: 'Cable' });
    for (const name of OTHER_NAMES) {
      expect([name, byName.get(name)?.category]).toEqual([name, null]);
      expect(byName.get(name)?.equipment).toEqual(expect.any(String));
    }
    const uncategorised = SEED_EXERCISE_LIST.filter((e) => e.category === null);
    expect(uncategorised.map((e) => e.name).sort()).toEqual(
      [...OTHER_NAMES].sort(),
    );
  });

  it('offers the editor the same body parts and categories the code accepts', () => {
    const entry = schema.properties.exercises.items.properties;
    expect(entry.bodyPart.enum).toEqual(Object.keys(BodyPart));
    expect(entry.category.enum).toEqual([...EXERCISE_CATEGORIES, null]);
    expect(Object.keys(entry)).toEqual(
      expect.arrayContaining(['videoKey', 'imageKey']),
    );
    expect(Object.keys(entry)).not.toContain('videoUrl');
    expect(schema.properties.exercises.items.required).not.toContain(
      'videoKey',
    );
  });

  it('gives the editor the same key rules as the code (ADR 0026)', () => {
    const entry = schema.properties.exercises.items.properties;
    const video = new RegExp(entry.videoKey.pattern);
    const image = new RegExp(entry.imageKey.pattern);
    for (const key of ['exercises/snatch-v1.mp4', 'snatch.webm']) {
      expect(video.test(key)).toBe(true);
    }
    for (const key of ['exercises/snatch-v1.jpg', 'a/b/snatch.png', 'x.webp']) {
      expect(image.test(key)).toBe(true);
    }
    for (const key of [
      '/exercises/snatch-v1.mp4',
      'exercises/../snatch-v1.mp4',
      'https://storage.googleapis.com/b/snatch-v1.mp4',
      'exercises/snatch-v1.mov',
      'exercises/snatch-v1.jpg',
      'exercises//snatch-v1.mp4',
      'exercises/Snatch-v1.mp4',
      'exercises/snatch v1.mp4',
    ]) {
      expect(video.test(key)).toBe(false);
    }
    expect(image.test('exercises/snatch-v1.gif')).toBe(false);
    expect(image.test('exercises/snatch-v1.mp4')).toBe(false);
  });

  it('points the shipped file at its schema', () => {
    expect(exercisesFile.$schema).toBe('./exercises.schema.json');
  });
});

describe('parseSeedExercises', () => {
  const parse = (exercises: unknown[]) => () =>
    parseSeedExercises({ exercises });

  it('maps body part names to their stored codes', () => {
    expect(parseSeedExercises({ exercises: [valid] })).toEqual([
      { ...valid, bodyPart: BodyPart.LEGS, ...noMedia },
    ]);
  });

  it('reads an optional videoKey and imageKey (ADR 0026)', () => {
    const media = {
      videoKey: 'exercises/back-squat-v1.mp4',
      imageKey: 'exercises/back-squat-v1.webp',
    };
    expect(
      parseSeedExercises({ exercises: [{ ...valid, ...media }] })[0],
    ).toMatchObject(media);
    expect(
      parseSeedExercises({
        exercises: [{ ...valid, videoKey: null, imageKey: null }],
      })[0],
    ).toMatchObject(noMedia);
  });

  it('accepts a null category and a null equipment', () => {
    expect(
      parseSeedExercises({
        exercises: [{ ...valid, category: null, equipment: null }],
      })[0],
    ).toMatchObject({ category: null, equipment: null });
  });

  it('rejects a file without an exercises list', () => {
    expect(() => parseSeedExercises({})).toThrow(/"exercises" list/);
    expect(() => parseSeedExercises(null)).toThrow(/"exercises" list/);
  });

  it.each([
    ['an unknown body part', { ...valid, bodyPart: 'GLUTES' }, /bodyPart/],
    ['a stored code as body part', { ...valid, bodyPart: 'LG' }, /bodyPart/],
    [
      'a category outside the four',
      { ...valid, category: 'Cardio' },
      /category/,
    ],
    ['a blank name', { ...valid, name: '  ' }, /name/],
    ['a name with outer spaces', { ...valid, name: ' Back Squat' }, /name/],
    ['a blank equipment', { ...valid, equipment: '' }, /equipment/],
    [
      'a missing field',
      { name: 'Dip', bodyPart: 'CHEST', category: 'Press' },
      /equipment/,
    ],
    ['a misspelt field', { ...valid, bodypart: 'LEGS' }, /bodypart/],
    [
      'a video key with a leading /',
      { ...valid, videoKey: '/exercises/back-squat-v1.mp4' },
      /videoKey.*start with/,
    ],
    [
      'a video key with ..',
      { ...valid, videoKey: 'exercises/../back-squat-v1.mp4' },
      /videoKey.*\.\./,
    ],
    [
      'a URL as image key',
      {
        ...valid,
        imageKey: 'https://storage.googleapis.com/b/back-squat-v1.jpg',
      },
      /imageKey.*URL/,
    ],
    [
      'a .mov video',
      { ...valid, videoKey: 'exercises/back-squat-v1.mov' },
      /videoKey.*\.mp4 or \.webm/,
    ],
    [
      'a .gif image',
      { ...valid, imageKey: 'exercises/back-squat-v1.gif' },
      /imageKey.*\.jpg/,
    ],
    ['a blank image key', { ...valid, imageKey: '' }, /imageKey/],
    [
      'a videoUrl (the file takes keys)',
      { ...valid, videoUrl: 'https://youtu.be/abcdefghijk' },
      /unknown field "videoUrl"/,
    ],
  ])('rejects %s, naming the entry', (_, entry, field) => {
    expect(parse([entry])).toThrow(field);
    expect(parse([entry])).toThrow(/exercises\[0\]/);
  });

  it('rejects the same name twice in any case', () => {
    expect(parse([valid, { ...valid, name: 'BACK SQUAT' }])).toThrow(
      /exercises\[1\].*"BACK SQUAT".*exercises\[0\]/,
    );
  });
});
