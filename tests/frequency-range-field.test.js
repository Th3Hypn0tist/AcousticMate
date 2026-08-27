import test from 'node:test';
import assert from 'node:assert/strict';
import { AggregatedFrequencyField, aggregateMagnitudes, frequencySamples } from '../src/aggregated-frequency-field.js';
import { RectangularRoomField } from '../src/rectangular-room-field.js';

test('frequencySamples includes both range endpoints', () => {
  assert.deepEqual(frequencySamples(20, 80, 4), [20, 40, 60, 80]);
});

test('aggregation modes have explicit magnitude semantics', () => {
  const values = [1, 2, 3];
  assert.equal(aggregateMagnitudes(values, 'peak'), 3);
  assert.ok(Math.abs(aggregateMagnitudes(values, 'rms') - Math.sqrt(14 / 3)) < 1e-12);
  assert.equal(aggregateMagnitudes(values, 'energy'), 14);
  assert.equal(aggregateMagnitudes(values, 'sum'), 6);
});

test('AggregatedFrequencyField samples source at cached frequency points', () => {
  const calls = [];
  const source = { sampleAtFrequency(x, y, z, frequency) { calls.push(frequency); return frequency / 10; } };
  const field = new AggregatedFrequencyField({ field: source, minHz: 20, maxHz: 40, samples: 3, aggregation: 'peak' });
  assert.equal(field.sample(0, 0, 0), 4);
  assert.deepEqual(calls, [20, 30, 40]);
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
