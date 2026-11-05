import { WeightUnitService } from './weight-unit.service';

// The largest values the API stores: reps in an int4 column, kg in numeric(6,2)
export const MAX_REPS = 2147483647;
export const MAX_WEIGHT_KG = 9999.99;

// The smallest 1RM the API takes, 0.01 kg (less would be stored as 0 kg).
// Pounds are sent as kg rounded to 2 decimals: 0.02 lb is the smallest
// 2-decimal pound value that reaches it (0.01 lb is 0.0045 kg, sent as 0).
export const MIN_WEIGHT_KG = 0.01;
const MIN_WEIGHT = { kg: MIN_WEIGHT_KG, lb: 0.02 } as const;

/**
 * Why a weight typed in the user's unit can't be stored as a 1RM, or '' when
 * it can or the field is still empty: the API takes MIN_WEIGHT_KG to
 * MAX_WEIGHT_KG.
 */
export function weightInputError(
  value: unknown,
  units: WeightUnitService,
): string {
  if (value === null || value === undefined || value === '') return '';
  const kg = units.toKg(Number(value));
  const unit = units.unit();
  if (kg !== null && kg > MAX_WEIGHT_KG) {
    return `At most ${units.toInput(MAX_WEIGHT_KG)} ${unit}`;
  }
  // NaN fails the comparison too
  if (!(kg !== null && kg >= MIN_WEIGHT_KG)) {
    return `At least ${MIN_WEIGHT[unit]} ${unit}`;
  }
  return '';
}

/** A weight is typed and the API can store it */
export function isStorableWeight(
  value: unknown,
  units: WeightUnitService,
): boolean {
  return (
    value !== null &&
    value !== undefined &&
    value !== '' &&
    !weightInputError(value, units)
  );
}
