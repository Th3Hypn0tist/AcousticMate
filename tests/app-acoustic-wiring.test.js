import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

test('main app uses AcousticRuntime instead of owning analytical solver wiring', () => {
  assert.match(mainSource, /import\s+\{\s*AcousticRuntime\s*\}\s+from\s+'\.\/acoustic-runtime\.js'/);
  assert.match(mainSource, /new\s+AcousticRuntime\s*\(/);
  assert.doesNotMatch(mainSource, /import\s+\{\s*RectangularRoomField\s*\}/);
  assert.doesNotMatch(mainSource, /AggregatedFrequencyField/);
});

test('main field views consume the combined phase-aware frequency field', () => {
  assert.match(mainSource, /const\s+frequencyField\s*=\s*acousticRuntime\.frequencyField/);
  assert.match(mainSource, /field:\s*frequencyField/);
  assert.match(mainSource, /setFrequencyRange\(/);
  assert.match(mainSource, /setAggregation\(/);
});
