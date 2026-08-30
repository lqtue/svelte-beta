/**
 * Tiny localStorage helpers.
 *
 * Every browser-storage read/write in the app is best-effort: private mode,
 * a full quota or a hostile embedder all throw, and none of those are worth
 * breaking a page over. These wrap the try/catch once so callers don't.
 *
 * For a store that should persist itself, prefer `createPersistedStore`.
 */

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Reads + JSON-parses `key`. Returns `fallback` when absent, unparseable or unavailable. */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** JSON-serialises `value` into `key`. Silently no-ops when storage is unavailable. */
export function writeJson(key: string, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — nothing to do */
  }
}

/** Reads a raw (non-JSON) string value. */
export function readText(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Writes a raw (non-JSON) string value; `null` removes the key. */
export function writeText(key: string, value: string | null): void {
  try {
    const s = storage();
    if (!s) return;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* quota / private mode — nothing to do */
  }
}
