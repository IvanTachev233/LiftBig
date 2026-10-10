// Estimated 1RM (Epley); a single is its own 1RM.
export function estimateOneRepMax(weight: number, reps: number): number {
  return reps === 1 ? weight : (weight * (30 + reps)) / 30;
}

interface DatedEntry {
  reps: number;
  weightKg: number;
  // YYYY-MM-DD
  achievedOn: string;
  createdAt: string;
}

/** e1RM in kg over time from the 1-3 rep entries; x is UTC midnight of the day */
export function e1rmPoints(entries: DatedEntry[]): { x: number; y: number }[] {
  return entries
    .filter((e) => e.reps >= 1 && e.reps <= 3)
    .sort(
      (a, b) =>
        a.achievedOn.localeCompare(b.achievedOn) ||
        a.createdAt.localeCompare(b.createdAt),
    )
    .map((e) => {
      const [year, month, day] = e.achievedOn.split('-').map(Number);
      return {
        x: Date.UTC(year, month - 1, day),
        y: estimateOneRepMax(e.weightKg, e.reps),
      };
    });
}
