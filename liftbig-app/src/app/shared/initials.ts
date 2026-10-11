/** "AR" for Alex Rivera; the email's first letter without a name */
export function initialsOf(name: string | null | undefined, email: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  const initials = letters.map((w) => w[0]).join('');
  return (initials || email?.[0] || '?').toUpperCase();
}
