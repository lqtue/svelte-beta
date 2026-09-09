/**
 * connection.ts — whether to spend a reader's bandwidth on decoration.
 *
 * Lived inside `HeroMap` until `HeroDemo` needed the same answer *before*
 * importing it: the point of a dynamic import is that a metered connection
 * never fetches the chunk, which cannot be decided from inside the chunk.
 *
 * `saveData` and `effectiveType` are Chromium-only. Everywhere else this is
 * false and the decoration plays, which is the right default — a browser that
 * will not say is not saying "no".
 */
export function isMeteredConnection(): boolean {
  const c = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  if (!c) return false;
  return c.saveData === true || c.effectiveType === 'slow-2g' || c.effectiveType === '2g';
}
