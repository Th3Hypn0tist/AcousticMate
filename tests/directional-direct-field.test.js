import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectSoundField } from '../src/direct-sound-field.js';
import { HybridAcousticField, logarithmicTransitionWeight } from '../src/hybrid-acoustic-field.js';
import { Speaker } from '../src/speaker.js';
import { quaternionFromEulerDegrees } from '../src/spatial.js';

test('directional direct field distinguishes front and rear at equal distance', () => {
  const speaker = new Speaker({
    id: 'directional',
    position: [0, 0, 0],
    directivity: {
      mode: 'simple-coverage',
      horizontalByFrequency: [[100, 90], [1000, 90]],
      verticalByFrequency: [[100, 90], [1000, 90]],
    },
  });
  const field = new DirectSoundField({ speakers: [speaker] });
  const front = field.sampleAtFrequency(0, 0, 1, 500);
  const rear = field.sampleAtFrequency(0, 0, -1, 500);
  assert.ok(front > rear * 100, `Expected strong front/rear contrast, got ${front} vs ${rear}`);
});

test('rotating speaker 180 degrees swaps direct field front and rear', () => {
  const speaker = new Speaker({
    id: 'rotated',
    position: [0, 0, 0],
    directivity: {
      mode: 'simple-coverage',
      horizontalByFrequency: [[100, 90], [1000, 90]],
      verticalByFrequency: [[100, 180], [1000, 180]],
    },
  });
  const field = new DirectSoundField({ speakers: [speaker] });
  const beforeFront = field.sampleAtFrequency(0, 0, 1, 500);
  const beforeRear = field.sampleAtFrequency(0, 0, -1, 500);
  speaker.setOrientation(quaternionFromEulerDegrees({ yaw: 180 }));
  const afterFront = field.sampleAtFrequency(0, 0, 1, 500);
  const afterRear = field.sampleAtFrequency(0, 0, -1, 500);
  assert.ok(beforeFront > beforeRear);
  assert.ok(afterRear > afterFront);
});

test('hybrid weighting moves monotonically from modal to direct field on log frequency axis', () => {
  const low = logarithmicTransitionWeight(20, 20, 500, .22);
  const middle = logarithmicTransitionWeight(100, 20, 500, .22);
  const high = logarithmicTransitionWeight(500, 20, 500, .22);
  assert.equal(low, .22);
  assert.ok(middle > low && middle < high);
  assert.equal(high, 1);
});

test('HybridAcousticField exposes modal and direct components separately', () => {
  const modalField = { sampleComplexAtFrequency: () => [2, 0] };
  const directField = { sampleComplexAtFrequency: () => [0, 1] };
  const field = new HybridAcousticField({ modalField, directField, transitionStartHz: 20, transitionEndHz: 500, minimumDirectWeight: .22 });
  const sample = field.sampleComponentsComplexAtFrequency(0, 0, 0, 100);
  assert.deepEqual(sample.modal, [2, 0]);
  assert.deepEqual(sample.direct, [0, 1]);
  assert.ok(sample.weights.direct > .22 && sample.weights.direct < 1);
});
