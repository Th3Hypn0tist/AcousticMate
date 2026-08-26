import test from 'node:test';
import assert from 'node:assert/strict';
import { OrthogonalFieldSlices } from '../vendor/S3D/domains/acoustics/orthogonal-field-slices.js';

const field = { sample: (x, y, z) => x + y + z };
const bounds = { min: [0, 0, 0], max: [2, 2, 2] };

test('vendored OrthogonalFieldSlices supports count and per-axis opacity', () => {
  const slices = new OrthogonalFieldSlices({
    id: 'slices',
    field,
    bounds,
    counts: { x: 2, y: 1, z: 0 },
    opacities: { x: .12, y: .42, z: .8 },
    resolution: { xz: [2, 2], xy: [2, 2], yz: [2, 2] },
  });
  slices.rebuild();
  assert.equal(slices.slicePositions('x').length, 2);
  assert.equal(slices.slicePositions('y').length, 1);
  assert.equal(slices.slicePositions('z').length, 0);
  assert.ok(slices.samples.filter(sample => sample.axis === 'x').every(sample => sample.color[3] === .12));
  assert.ok(slices.samples.filter(sample => sample.axis === 'y').every(sample => sample.color[3] === .42));
});
