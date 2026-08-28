import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectivityModel } from '../src/directivity-model.js';
import { quaternionFromEulerDegrees } from '../src/spatial.js';

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('DirectivityModel uses speaker-local +Z as the forward reference axis', () => {
  const model = new DirectivityModel({
    mode: 'simple-coverage',
    horizontalByFrequency: [[100, 90], [10000, 90]],
    verticalByFrequency: [[100, 60], [10000, 60]],
  });
  close(model.gainForWorldDirection(1000, [0, 0, 1]), 1);
  assert.ok(model.gainForWorldDirection(1000, [1, 0, 0]) < 1);
  assert.ok(model.gainForWorldDirection(1000, [0, 1, 0]) < 1);
});

test('DirectivityModel transforms world direction through speaker orientation', () => {
  const model = new DirectivityModel({
    mode: 'simple-coverage',
    horizontalByFrequency: [[1000, 60]],
    verticalByFrequency: [[1000, 60]],
  });
  const yaw90 = quaternionFromEulerDegrees({ yaw: 90 });
  close(model.gainForWorldDirection(1000, [1, 0, 0], yaw90), 1, 1e-8);
  assert.ok(model.gainForWorldDirection(1000, [0, 0, 1], yaw90) < .1);
});

test('simple coverage keeps endpoint coverage outside its measured frequency span instead of falling back to 360 degrees', () => {
  const model = new DirectivityModel({
    mode: 'simple-coverage',
    horizontalByFrequency: [[500, 120], [5000, 60]],
    verticalByFrequency: [[500, 100], [5000, 50]],
  });
  assert.deepEqual(model.coverageAt(100), { horizontal: 120, vertical: 100 });
  assert.deepEqual(model.coverageAt(20000), { horizontal: 60, vertical: 50 });
  assert.ok(model.gainLinear(20000, 90, 0) < 1);
});

test('polar-data mode interpolates supplied gain data without changing the Speaker interface', () => {
  const model = new DirectivityModel({
    mode: 'polar-data',
    polarData: {
      frequencies: [1000, 2000],
      azimuths: [-90, 0, 90],
      elevations: [0],
      gains: [
        [[.25, 1, .25]],
        [[.5, 1, .5]],
      ],
      unit: 'linear',
    },
  });
  close(model.gainLinear(1500, 0, 0), 1);
  close(model.gainLinear(1500, 90, 0), .375);
});
