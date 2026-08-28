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
  await assertModuleGraph(new URL('../src/slice-controls-ui.js', import.meta.url));
  await assertModuleGraph(new URL('../src/field-component-ui.js', import.meta.url));
  await assertModuleGraph(new URL('../src/gizmo-runtime.js', import.meta.url));
});

test('gizmo browser regression harness uses a complete local module graph', async () => {
  await assert.doesNotReject(readFile(new URL('../browser-tests/gizmo.html', import.meta.url)));
  await assertModuleGraph(new URL('../browser-tests/gizmo.js', import.meta.url));
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

test('speaker-library manifest references valid JSON model definitions', async () => {
  const manifestUrl = new URL('../speaker-library/manifest.json', import.meta.url);
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  assert.ok(Array.isArray(manifest.models) && manifest.models.length > 0, 'Expected at least one speaker model');
  const ids = new Set();
  for (const path of manifest.models) {
    const definitionUrl = new URL(path, manifestUrl);
    const definition = JSON.parse(await readFile(definitionUrl, 'utf8'));
    assert.equal(typeof definition.id, 'string');
    assert.ok(definition.id.length > 0);
    assert.equal(ids.has(definition.id), false, `Duplicate SpeakerModel id: ${definition.id}`);
    ids.add(definition.id);
    assert.equal(typeof definition.model, 'string');
    assert.equal(typeof definition.type, 'string');
  }
});
