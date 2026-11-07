import {
  EXERCISE_CATEGORIES,
  ExerciseCategory,
} from '../../common/exercise-categories';
import { BodyPart } from '../../workouts/entities/exercise.entity';
import { MediaKind, mediaKeyProblem } from '../../workouts/exercise-media';
import exercisesFile from './exercises.json';

export interface SeedExercise {
  name: string;
  bodyPart: BodyPart;
  // null: listed under "Other" in the picker
  category: ExerciseCategory | null;
  equipment: string | null;
  // Object keys in the public demo media bucket (ADR 0026), e.g.
  // exercises/snatch-v1.mp4; the API sends them as URLs. null when the file
  // leaves them out. The seeder keeps a global's keys equal to these.
  videoKey: string | null;
  // The picker's thumbnail, e.g. exercises/snatch-v1.webp
  imageKey: string | null;
}

const REQUIRED = ['name', 'bodyPart', 'category', 'equipment'];
const OPTIONAL: Record<string, MediaKind> = {
  videoKey: 'video',
  imageKey: 'image',
};
const FIELDS = [...REQUIRED, ...Object.keys(OPTIONAL)];

const BODY_PARTS = Object.keys(BodyPart) as (keyof typeof BodyPart)[];

/**
 * Checks the global exercise file (exercises.json, described by
 * exercises.schema.json) and turns body part names into their stored codes.
 * Throws on the first bad entry, naming its index and name, so a typo fails
 * the unit tests and the API start instead of seeding a wrong row.
 */
export function parseSeedExercises(file: unknown): SeedExercise[] {
  const list =
    typeof file === 'object' && file !== null
      ? (file as { exercises?: unknown }).exercises
      : undefined;
  if (!Array.isArray(list)) {
    throw new Error('The seed exercise file needs an "exercises" list');
  }
  const seen = new Map<string, number>();
  return list.map((raw: unknown, i) => {
    const entry =
      typeof raw === 'object' && raw !== null && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const label = typeof entry.name === 'string' ? ` ("${entry.name}")` : '';
    const fail = (problem: string) =>
      new Error(`exercises[${i}]${label}: ${problem}`);

    for (const key of Object.keys(entry)) {
      if (!FIELDS.includes(key)) {
        throw fail(`unknown field "${key}"; fields: ${FIELDS.join(', ')}`);
      }
    }
    for (const key of REQUIRED) {
      if (!(key in entry)) throw fail(`missing field "${key}"`);
    }
    for (const [key, kind] of Object.entries(OPTIONAL)) {
      const value = entry[key];
      if (value !== undefined && value !== null) {
        const problem = mediaKeyProblem(value, kind);
        if (problem) throw fail(`"${key}" ${problem}`);
      }
    }

    const { name, bodyPart, category, equipment } = entry;
    if (typeof name !== 'string' || name === '' || name.trim() !== name) {
      throw fail('"name" must be text with no spaces at either end');
    }
    if (!BODY_PARTS.includes(bodyPart as keyof typeof BodyPart)) {
      throw fail(`"bodyPart" must be one of ${BODY_PARTS.join(', ')}`);
    }
    if (
      category !== null &&
      !EXERCISE_CATEGORIES.includes(category as ExerciseCategory)
    ) {
      throw fail(
        `"category" must be one of ${EXERCISE_CATEGORIES.join(', ')} or null`,
      );
    }
    if (
      equipment !== null &&
      (typeof equipment !== 'string' || equipment.trim() === '')
    ) {
      throw fail('"equipment" must be text or null');
    }

    const first = seen.get(name.toLowerCase());
    if (first !== undefined) {
      throw fail(`same name as exercises[${first}], ignoring letter case`);
    }
    seen.set(name.toLowerCase(), i);

    return {
      name,
      bodyPart: BodyPart[bodyPart as keyof typeof BodyPart],
      category: category as ExerciseCategory | null,
      equipment,
      videoKey: (entry.videoKey as string | undefined) ?? null,
      imageKey: (entry.imageKey as string | undefined) ?? null,
    };
  });
}

// The global exercises the seeder ensures on every start, in file order.
export const SEED_EXERCISE_LIST: readonly SeedExercise[] =
  parseSeedExercises(exercisesFile);
