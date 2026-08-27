import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateValues, frequencySamples } from '../vendor/S3D/domains/acoustics/scalar-field-view.js';
import { RectangularRoomField } from '../src/rectangular-room-field.js';

test('frequencySamples includes both range endpoints and supports one-point ranges', () => {
  assert.deepEqual(frequencySamples([20, 80], 4), [20, 40, 60, 80]);
  assert.deepEqual(frequencySamples([40, 40], 12), [40]);
});

test('canonical aggregation modes have explicit magnitude semantics', () => {
  const values = [1, 2, 3];
  assert.equal(aggregateValues(values, 'peak'), 3);
  assert.ok(Math.abs(aggregateValues(values, 'rms') - Math.sqrt(14 / 3)) < 1e-12);
  assert.equal(aggregateValues(values, 'energy'), 14);
  assert.equal(aggregateValues(values, 'sum'), 6);
});

test('RectangularRoomField caches prepared modes independently by frequency', () => {
  const speaker = { position: [1, 1, 1], enabled: true, transferAt: () => [1, 0] };
  const field = new RectangularRoomField({ dimensions: { width: 6, height: 2.7, depth: 4.5 }, speakers: [speaker], maxFrequency: 100 });
  const first = field.prepareModesAt(40);
  const again = field.prepareModesAt(40);
  const second = field.prepareModesAt(60);
  assert.equal(first, again);
  assert.notEqual(first, second);
  assert.equal(field.preparedModeCache.size, 2);
  field.invalidate();
  assert.equal(field.preparedModeCache.size, 0);
});
