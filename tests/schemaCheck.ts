/**
 * schemaCheck.ts — the subset of JSON Schema the files in `contracts/` use.
 *
 * ponytail: a ~50-line walker rather than a validator library. The only
 * installed validator is a transitive eslint dependency on draft-07, which
 * would vanish on any lockfile change, and these schemas are small. Supported:
 * `type` (including unions with "null"), `required`, `properties`, `items`,
 * `enum`. Anything else in a schema is ignored rather than silently passed —
 * `unsupportedKeywords` lists what a schema asked for and this cannot check,
 * so adding `pattern` to a contract fails loudly here instead of doing nothing.
 */
import { readFileSync } from 'node:fs';

export type Schema = Record<string, unknown>;

const KNOWN = new Set([
  '$schema',
  '$id',
  'title',
  'description',
  'type',
  'required',
  'properties',
  'items',
  'enum',
]);

export function loadSchema(name: string): Schema {
  return JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), 'utf8'));
}

/** Keywords a schema uses that this checker does not implement. Should be empty. */
export function unsupportedKeywords(schema: Schema, path = ''): string[] {
  const out: string[] = [];
  for (const k of Object.keys(schema)) if (!KNOWN.has(k)) out.push(`${path}.${k}`);
  const props = schema.properties as Record<string, Schema> | undefined;
  if (props)
    for (const [k, v] of Object.entries(props)) out.push(...unsupportedKeywords(v, `${path}.${k}`));
  const items = schema.items as Schema | undefined;
  if (items) out.push(...unsupportedKeywords(items, `${path}[]`));
  return out;
}

const typeOf = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? 'number' : typeof v;

/** Every way `value` fails `schema`, as human-readable paths. Empty means it conforms. */
export function validate(schema: Schema, value: unknown, path = '$'): string[] {
  const errors: string[] = [];
  const types = schema.type
    ? Array.isArray(schema.type)
      ? (schema.type as string[])
      : [schema.type as string]
    : null;

  if (types) {
    const actual = typeOf(value);
    const ok = types.some(
      (t) => t === actual || (t === 'integer' && actual === 'number' && Number.isInteger(value))
    );
    if (!ok) {
      errors.push(`${path}: expected ${types.join('|')}, got ${actual}`);
      return errors; // a wrong type makes every nested complaint noise
    }
  }

  if (Array.isArray(schema.enum) && !(schema.enum as unknown[]).includes(value)) {
    errors.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  }

  if (typeOf(value) === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of (schema.required as string[] | undefined) ?? []) {
      if (!(key in obj)) errors.push(`${path}.${key}: missing`);
    }
    const props = schema.properties as Record<string, Schema> | undefined;
    if (props) {
      for (const [key, sub] of Object.entries(props)) {
        if (key in obj) errors.push(...validate(sub, obj[key], `${path}.${key}`));
      }
    }
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((v, i) => errors.push(...validate(schema.items as Schema, v, `${path}[${i}]`)));
  }

  return errors;
}
