import test from 'node:test';
import assert from 'node:assert/strict';
import { AcousticRuntime } from '../src/acoustic-runtime.js';
import { CrossoverNetwork } from '../src/crossover-network.js';
import { RectangularRoom } from '../src/room.js';
import { Speaker } from '../src/speaker.js';

test('AcousticRuntime owns domain modes and combined field orchestration', () => {
  const room = new RectangularRoom({ width: 6, height: 2.7, depth: 4.5 });
  const speakers = [new Speaker({ id: 'speaker-1', position: [1, .5, 1] })];
  const runtime = new AcousticRuntime({
    room,
    speakers,
    crossoverNetwork: new CrossoverNetwork(),
    frequencyRange: [20, 100],
  });
  assert.equal(runtime.domain.geometryType, 'rectangular');
  assert.ok(Array.isArray(runtime.modes));
  assert.equal(runtime.combinedField.domain, runtime.domain);
  assert.equal(runtime.frequencyField, runtime.combinedField.frequencyField);
  assert.equal(runtime.roomField, runtime.combinedField.roomField);
  assert.ok(Number.isFinite(runtime.fieldAtFrequency(50).sample(2, 1, 2)));
});

test('AcousticRuntime refreshes sources through CombinedAcousticField', () => {
  const room = new RectangularRoom();
  const speakers = [];
  const runtime = new AcousticRuntime({ room, speakers, frequencyRange: [20, 100] });
  const speaker = new Speaker({ id: 'speaker-added', position: [1, .5, 1] });
  speakers.push(speaker);
  runtime.invalidate();
  assert.ok(runtime.roomField.speakers.includes(speaker));
  speakers.splice(0, 1);
  runtime.invalidate();
  assert.equal(runtime.roomField.speakers.includes(speaker), false);
});

test('AcousticRuntime rebuilds domain and mode metadata when room changes', () => {
  const room = new RectangularRoom({ width: 6, height: 2.7, depth: 4.5 });
  const runtime = new AcousticRuntime({ room, frequencyRange: [20, 100] });
  const previousDomain = runtime.domain;
  room.setDimensions({ width: 7 });
  runtime.syncRoom();
  assert.notEqual(runtime.domain, previousDomain);
  assert.equal(runtime.domain.dimensions.width, 7);
  assert.equal(runtime.roomField.dimensions.width, 7);
});

test('AcousticRuntime accepts a single-point analysis range', () => {
  const runtime = new AcousticRuntime({ room: new RectangularRoom(), frequencyRange: [50, 50] });
  assert.deepEqual(runtime.frequencyRange, [50, 50]);
  runtime.setFrequencyRange(60, 60);
  assert.deepEqual(runtime.frequencyRange, [60, 60]);
  assert.equal(runtime.roomField.maxFrequency, 60);
});
