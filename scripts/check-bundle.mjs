// Fails the build if the client bundle references a chunk it did not emit.
//
// Cloudflare Pages restores .svelte-kit from its build-output cache, which has
// twice produced a deploy whose entry/app.<hash>.js imported a
// nodes/N.<hash>.js that was never written. Every route sets `ssr = false`, so
// the result is a fully blank site with no server-side error — nothing else in
// the pipeline catches it.
//
// ponytail: regex over the emitted JS, not a real module graph. Import
// specifiers in built output are always plain quoted literals, so this holds;
// if a future bundler emits computed specifiers, parse with es-module-lexer.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const root = '.svelte-kit/output/client/_app/immutable';

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
  );
}

if (!existsSync(root)) {
  console.error(`check-bundle: ${root} missing — did vite build run?`);
  process.exit(1);
}

const files = walk(root).filter((f) => f.endsWith('.js'));
const missing = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  // static `from"./x.js"` / `import"./x.js"` and dynamic `import("./x.js")`
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["'](\.[^"']+\.js)["']/g)) {
    const target = resolve(dirname(file), m[1]);
    if (!existsSync(target)) {
      missing.push(`${relative(root, file)} -> ${m[1]}`);
    }
  }
}

if (missing.length) {
  console.error(`check-bundle: ${missing.length} unresolved import(s) in client bundle:`);
  for (const m of [...new Set(missing)].slice(0, 30)) console.error(`  ${m}`);
  process.exit(1);
}

console.log(`check-bundle: ${files.length} client chunks, all imports resolve`);
