import {
  EXERCISE_CATEGORIES,
  ExerciseCategory,
} from '../../common/exercise-categories';
import { BodyPart } from '../../workouts/entities/exercise.entity';
import exercisesFile from './exercises.json';

export interface SeedExercise {
  name: string;
  bodyPart: BodyPart;
  // null: listed under "Other" in the picker
  category: ExerciseCategory | null;
  equipment: string | null;
  // https only; the app embeds YouTube and Vimeo links and plays .mp4,
  // .webm and .mov files. null when the file leaves it out
  videoUrl: string | null;
  // https only; the picker's thumbnail
  imageUrl: string | null;
}

const REQUIRED = ['name', 'bodyPart', 'category', 'equipment'];
const OPTIONAL = ['videoUrl', 'imageUrl'];
const FIELDS = [...REQUIRED, ...OPTIONAL];

// Same rule as a coach's videoUrl: an absolute https URL with a host
function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' && url.hostname !== '' && value.trim() === value
    );
  } catch {
    return false;
  }
}
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
    for (const key of OPTIONAL) {
      const value = entry[key];
      if (value !== undefined && value !== null) {
        if (typeof value !== 'string' || !isHttpsUrl(value)) {
          throw fail(`"${key}" must be an https URL or null`);
        }
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
      videoUrl: (entry.videoUrl as string | undefined) ?? null,
      imageUrl: (entry.imageUrl as string | undefined) ?? null,
    };
  });
}

// The global exercises the seeder ensures on every start, in file order.
export const SEED_EXERCISE_LIST: readonly SeedExercise[] =
  parseSeedExercises(exercisesFile);
