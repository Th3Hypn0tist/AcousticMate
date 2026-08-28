import test from 'node:test';
import assert from 'node:assert/strict';
import { FieldViewRangeCoordinator } from '../vendor/S3D/domains/acoustics/field-view-range-coordinator.js';
import { SampledFieldPlane } from '../vendor/S3D/domains/acoustics/sampled-field-plane.js';
import { evenSliceFractions, MAX_SLICES_PER_AXIS, OrthogonalFieldSlices } from '../vendor/S3D/domains/acoustics/orthogonal-field-slices.js';

const field = { sample: (x, y, z) => x + y + z };

test('vendored 3D field limits slices to ten per axis', () => {
  const view = new OrthogonalFieldSlices({ field, bounds: { min: [0, 0, 0], max: [2, 2, 2] } });
  assert.equal(MAX_SLICES_PER_AXIS, 10);
  assert.doesNotThrow(() => view.setSliceCount('z', 10));
  assert.throws(() => view.setSliceCount('z', 11), /0 to 10/);
});

test('vendored slices redistribute evenly when count changes', () => {
  assert.deepEqual(evenSliceFractions(2), [1 / 3, 2 / 3]);
  assert.deepEqual(evenSliceFractions(3), [1 / 4, 2 / 4, 3 / 4]);
  assert.deepEqual(evenSliceFractions(4), [1 / 5, 2 / 5, 3 / 5, 4 / 5]);

  const view = new OrthogonalFieldSlices({ field, bounds: { min: [0, 0, 0], max: [6, 3, 4.5] }, counts: { x: 4, y: 4, z: 4 } });
  assert.deepEqual(view.slicePositions('x'), [1.2, 2.4, 3.6, 4.8]);
  assert.deepEqual(view.slicePositions('y'), [.6, 1.2, 1.8, 2.4]);
  assert.deepEqual(view.slicePositions('z'), [.9, 1.8, 2.7, 3.6]);
});

test('increasing slice count does not recolor the existing heatmap', () => {
  const heatmap = new SampledFieldPlane({
    field,
    id: '2d',
    bounds: { min: [0, 0, 0], max: [2, 0, 2] },
    resolution: [2, 2],
  });
  const slices = new OrthogonalFieldSlices({
    field: { sample: (x, y, z) => x + y + z + (x > 1 ? 100 : 0) },
    id: '3d',
    bounds: { min: [0, 0, 0], max: [2, 2, 2] },
    counts: { x: 1, y: 0, z: 0 },
    resolution: { yz: [2, 2] },
  });
  heatmap.visible = true;
  slices.visible = true;

  const coordinator = new FieldViewRangeCoordinator({ views: [heatmap, slices] });
  coordinator.update();
  const rangeBefore = [...coordinator.range];
  const colorsBefore = heatmap.samples.map(sample => [...sample.color]);

  slices.setSliceCount('x', 2);
  coordinator.invalidate();
  coordinator.update();

  assert.deepEqual(coordinator.range, rangeBefore);
  assert.deepEqual(heatmap.samples.map(sample => sample.color), colorsBefore);
});
