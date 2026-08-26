import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const importPattern = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
const cssImportPattern = /@import\s+(?:url\()?['"]([^'"]+)['"]/g;

async function assertModuleGraph(entryUrl, visited = new Set()) {
  const key = String(entryUrl);
  if (visited.has(key)) return;
  visited.add(key);

  const source = await readFile(entryUrl, 'utf8');
  for (const match of source.matchAll(importPattern)) {
    const dependency = new URL(match[1], entryUrl);
    await assert.doesNotReject(readFile(dependency), `Missing browser module: ${fileURLToPath(dependency)}`);
    await assertModuleGraph(dependency, visited);
  }
}

test('browser entry uses a complete local module graph', async () => {
  await assertModuleGraph(new URL('../src/main.js', import.meta.url));
});

test('application stylesheet imports existing local stylesheets', async () => {
  const entryUrl = new URL('../styles/acousticmate.css', import.meta.url);
  const source = await readFile(entryUrl, 'utf8');
  const imports = [...source.matchAll(cssImportPattern)];
  assert.ok(imports.length > 0, 'Expected the application stylesheet to import a base theme');
  for (const match of imports) {
    const dependency = new URL(match[1], entryUrl);
    await assert.doesNotReject(readFile(dependency), `Missing browser stylesheet: ${fileURLToPath(dependency)}`);
  }
});
