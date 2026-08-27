import test from 'node:test';
import assert from 'node:assert/strict';
import { floorPoint } from '../src/room-editor.js';

test('floorPoint intersects camera ray with room floor plane', () => {
  const camera = {
    ray() { return { origin: [1, 2, 3], direction: [0, -1, .5] }; },
  };
  const canvas = { getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; } };
  const point = floorPoint(camera, canvas, { clientX: 10, clientY: 10 }, 0);
  assert.deepEqual(point, [1, 0, 4]);
});

test('floorPoint returns null when ray cannot reach floor', () => {
  const camera = { ray() { return { origin: [0, 1, 0], direction: [1, 0, 0] }; } };
  const canvas = { getBoundingClientRect() { return {}; } };
  assert.equal(floorPoint(camera, canvas, { clientX: 0, clientY: 0 }, 0), null);
});
