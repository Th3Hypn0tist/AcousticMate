import test from 'node:test';
import assert from 'node:assert/strict';
import { AcousticDomain } from '../src/acoustic-domain.js';
import { CombinedAcousticField } from '../src/combined-acoustic-field.js';
import { RectangularRoom } from '../src/room.js';
import { SpeakerModeCoupling } from '../src/speaker-mode-coupling.js';

test('AcousticDomain adapts a rectangular room without mixing rendering semantics', () => {
  const room = new RectangularRoom({ width: 6, height: 2.7, depth: 4.5 });
  room.addOpening({ id: 'door', wall: 'z-min', offset: 1, width: .9, height: 2.1 });
  const domain = AcousticDomain.fromRectangularRoom(room);
  assert.equal(domain.geometryType, 'rectangular');
  assert.deepEqual(domain.dimensions, room.dimensions);
  assert.equal(domain.openings().length, 1);
  assert.deepEqual(domain.bounds.max, [6, 2.7, 4.5]);
});

test('SpeakerModeCoupling exposes phase-aware contract outputs', () => {
  const speaker = {
    position: [1, .5, 1],
    transferAt() { return [1, 0]; },
    directivityGain() { return 1; },
  };
  const coupling = new SpeakerModeCoupling({ dimensions: { width: 6, height: 2.7, depth: 4.5 } });
  const result = coupling.evaluate(speaker, { nx: 1, ny: 0, nz: 0, frequency: 28.5833333333 });
  for (const key of ['spatialCoupling', 'directivityGain', 'responseGain', 'combinedExcitation']) {
    assert.equal(result[key].length, 2);
    assert.ok(result[key].every(Number.isFinite));
  }
});

test('CombinedAcousticField exposes scalar field at one frequency and frequency field', () => {
  const room = new RectangularRoom({ width: 6, height: 2.7, depth: 4.5 });
  const domain = AcousticDomain.fromRectangularRoom(room);
  const speaker = {
    id: 'speaker', enabled: true, position: [1, .5, 1],
    transferAt() { return [1, 0]; },
    directivityGain() { return 1; },
  };
  const combined = new CombinedAcousticField({ domain, speakers: [speaker], frequencyRange: [20, 100] });
  const fixed = combined.fieldAtFrequency(50);
  assert.equal(fixed.frequency, 50);
  assert.ok(Number.isFinite(fixed.sample(2, 1, 2)));
  assert.ok(Number.isFinite(combined.frequencyField.sample(2, 1, 2, 50)));
  assert.equal(typeof combined.frequencyField.sampleComplex, 'function');
});
