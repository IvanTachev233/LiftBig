/** Exercise body part codes and their names, in display order */
export const BODY_PARTS: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'CH', name: 'Chest' },
  { code: 'BK', name: 'Back' },
  { code: 'LG', name: 'Legs' },
  { code: 'SH', name: 'Shoulders' },
  { code: 'AR', name: 'Arms' },
  { code: 'CO', name: 'Core' },
  { code: 'FB', name: 'Full body' },
  { code: 'OT', name: 'Other' },
];

/** The body part's name; null for none or an unknown code */
export function bodyPartName(code: string | null | undefined): string | null {
  return BODY_PARTS.find((p) => p.code === code)?.name ?? null;
}
