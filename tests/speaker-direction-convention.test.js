import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeakerNode } from '../vendor/S3D/domains/acoustics/index.js';
import { DirectivityModel } from '../src/directivity-model.js';
import { quaternionFromEulerDegrees } from '../src/spatial.js';

function closeVector(actual, expected, epsilon = 1e-9) {
  assert.equal(actual.length, expected.length);
  for (let index = 0; index < actual.length; index++) assert.ok(Math.abs(actual[index] - expected[index]) <= epsilon, `${actual} != ${expected}`);
}

test('SpeakerNode visual forward and DirectivityModel share local +Z', () => {
  const directivity = new DirectivityModel({
    mode: 'simple-coverage',
    horizontalByFrequency: [[1000, 60]],
    verticalByFrequency: [[1000, 60]],
  });
  const orientation = quaternionFromEulerDegrees({ yaw: 90, pitch: 0, roll: 0 });
  const node = new SpeakerNode({ id: 'speaker-direction-test' });
  node.model = { orientation };

  const visualForward = node.effectiveDirection();
  closeVector(visualForward, [1, 0, 0]);
  assert.ok(Math.abs(directivity.gainForWorldDirection(1000, visualForward, orientation) - 1) <= 1e-9);
  assert.ok(directivity.gainForWorldDirection(1000, [0, 0, 1], orientation) < 1);
});
