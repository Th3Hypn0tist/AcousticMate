import test from 'node:test';
import assert from 'node:assert/strict';
import { OrthogonalFieldSlices } from '../vendor/S3D/domains/acoustics/orthogonal-field-slices.js';
import { SampledFieldPlane } from '../vendor/S3D/domains/acoustics/sampled-field-plane.js';
import { RenderStore } from '../vendor/S3D/core/render_store.js';

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

test('vendored RenderStore preserves alpha and separates transparent boxes', () => {
  const store = new RenderStore();
  store.begin([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  store.box([0, 0, 0], [1, 1, 1], [1, 0, 0, .25], false);
  store.box([1, 0, 0], [1, 1, 1], [0, 1, 0, 1], false);
  const snapshot = store.snapshot();
  assert.equal(snapshot.counts.transparentBoxes, 1);
  assert.equal(snapshot.counts.solidBoxes, 1);
  assert.equal(snapshot.transparentBoxes.length, 10);
  assert.equal(snapshot.transparentBoxes[9], .25);
});

test('2D sampled heatmap is protected from transparent slice overlays by default', () => {
  const heatmap = new SampledFieldPlane({ id: 'heatmap', field, bounds, resolution: [2, 2] });
  heatmap.rebuild();
  assert.equal(heatmap.protectFromTransparency, true);

  const calls = [];
  heatmap.draw({ box: (...args) => calls.push(args) });
  assert.equal(calls.length, 4);
  assert.ok(calls.every(call => call[4] === heatmap));
});
