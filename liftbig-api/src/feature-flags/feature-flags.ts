// The flags the API knows about (L3a, Vision pilot; see notes/spec.md §
// Tier 3 Vision pilot › Who can use it). A feature_flag row whose flag name
// is not here is ignored; add a name here when a new flag is introduced.
export const KNOWN_FLAGS = ['vision'] as const;

export type FlagName = (typeof KNOWN_FLAGS)[number];

// What /users/me adds under "flags": every known flag as a boolean.
export type FlagsPayload = Record<FlagName, boolean>;
