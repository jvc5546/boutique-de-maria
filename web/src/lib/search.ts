// Search that ignores accents and capitals: "locion" finds "Loción",
// "nandu" finds "Ñandú". Used by every search box on the site.
export const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** True when every word typed appears somewhere in the fields. */
export function matches(query: string, ...fields: (string | undefined | null)[]) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = fold(fields.filter(Boolean).join(' '));
  return words.every((w) => text.includes(w));
}
