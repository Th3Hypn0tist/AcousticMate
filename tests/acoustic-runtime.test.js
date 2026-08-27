import test from 'node:test';
import assert from 'node:assert/strict';
import { AcousticRuntime, modalCoverageRange } from '../src/acoustic-runtime.js';
import { CrossoverNetwork } from '../src/crossover-network.js';
import { RectangularRoom } from '../src/room.js';
import { Speaker } from '../src/speaker.js';

function basis(runtime) {
  return runtime.modes.map(mode => ({ nx: mode.indices.nx, ny: mode.indices.ny, nz: mode.indices.nz, frequency: mode.frequency }));
}

test('AcousticRuntime owns domain modes and combined field orchestration', () => {
  const room = new RectangularRoom({ width: 6, height: 2.7, depth: 4.5 });
  const speakers = [new Speaker({ id: 'speaker-1', position: [1, .5, 1] })];
  const runtime = new AcousticRuntime({ room, speakers, crossoverNetwork: new CrossoverNetwork(), frequencyRange: [20, 100] });
  assert.equal(runtime.domain.geometryType, 'rectangular');
  assert.equal(runtime.combinedField.domain, runtime.domain);
  assert.equal(runtime.frequencyField, runtime.combinedField.frequencyField);
  assert.equal(runtime.roomField, runtime.combinedField.roomField);
  assert.deepEqual(runtime.roomField.modes, basis(runtime));
  assert.ok(Number.isFinite(runtime.fieldAtFrequency(50).sample(2, 1, 2)));
});

test('modal basis coverage starts at zero instead of analysis minimum', () => {
  assert.deepEqual(modalCoverageRange([100, 140]), [0, 140]);
  const runtime = new AcousticRuntime({ room: new RectangularRoom({ width: 10, height: 3, depth: 8 }), frequencyRange: [100, 140] });
  assert.ok(runtime.modes.some(mode => mode.frequency < 100), 'Expected lower room modes to remain in the modal basis');
  assert.ok(runtime.modes.every(mode => mode.frequency <= 140));
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

test('AcousticRuntime rebuilds domain and modal basis when room changes', () => {
  const room = new RectangularRoom({ width: 6, height: 2.7, depth: 4.5 });
  const runtime = new AcousticRuntime({ room, frequencyRange: [20, 100] });
  const previousDomain = runtime.domain;
  room.setDimensions({ width: 7 });
  runtime.syncRoom();
  assert.notEqual(runtime.domain, previousDomain);
  assert.equal(runtime.domain.dimensions.width, 7);
  assert.equal(runtime.roomField.dimensions.width, 7);
  assert.deepEqual(runtime.roomField.modes, basis(runtime));
});

test('AcousticRuntime accepts a single-point analysis range while retaining modal coverage below it', () => {
  const runtime = new AcousticRuntime({ room: new RectangularRoom(), frequencyRange: [50, 50] });
  assert.deepEqual(runtime.frequencyRange, [50, 50]);
  assert.ok(runtime.modes.every(mode => mode.frequency <= 50));
  assert.deepEqual(runtime.roomField.modes, basis(runtime));
  runtime.setFrequencyRange(60, 60);
  assert.deepEqual(runtime.frequencyRange, [60, 60]);
  assert.equal(runtime.roomField.maxFrequency, 60);
  assert.ok(runtime.modes.every(mode => mode.frequency <= 60));
  assert.deepEqual(runtime.roomField.modes, basis(runtime));
});
