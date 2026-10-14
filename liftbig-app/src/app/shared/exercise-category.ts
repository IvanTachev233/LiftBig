import { Exercise } from '../core/workout.service';
import { bodyPartName } from './body-part';

/** Picker categories in display order; others follow in name order */
export const CATEGORIES: ReadonlyArray<string> = ['Olympic', 'Squat', 'Press', 'Pull'];

/** The categories given, known ones first in display order */
export function sortCategories(categories: Iterable<string>): string[] {
  const rank = (c: string) => {
    const i = CATEGORIES.indexOf(c);
    return i === -1 ? CATEGORIES.length : i;
  };
  return [...new Set(categories)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * "Olympic · Barbell"; without either, "Coach exercise" for a coach's own
 * exercise, else the body part's name, else null
 */
export function exerciseSubtitle(exercise: Exercise): string | null {
  const tags = [exercise.category, exercise.equipment].filter((t): t is string => !!t);
  if (tags.length) return tags.join(' · ');
  return exercise.createdById ? 'Coach exercise' : bodyPartName(exercise.bodyPart);
}
