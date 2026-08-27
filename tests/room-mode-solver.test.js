import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomModeSolver, modeClassification } from '../src/room-mode-solver.js';

test('RoomModeSolver exposes analytical modes with classification and scalar fields', () => {
  const solver = new RoomModeSolver();
  const modes = solver.solve({ dimensions: { width: 6, height: 2.7, depth: 4.5 } }, [20, 90]);
  assert.ok(modes.length > 0);
  const mode = modes[0];
  assert.match(mode.id, /^mode-\d+-\d+-\d+$/);
  assert.ok(['axial', 'tangential', 'oblique'].includes(mode.classification));
  assert.ok(mode.eigenvalue > 0);
  assert.equal(typeof mode.field.sample, 'function');
  assert.equal(mode.field.range[0], -1);
  assert.equal(mode.field.range[1], 1);
});

test('modeClassification follows non-zero mode index count', () => {
  assert.equal(modeClassification({ nx: 1, ny: 0, nz: 0 }), 'axial');
  assert.equal(modeClassification({ nx: 1, ny: 2, nz: 0 }), 'tangential');
  assert.equal(modeClassification({ nx: 1, ny: 2, nz: 3 }), 'oblique');
});

test('RoomModeSolver refuses to pretend numerical arbitrary geometry is implemented', () => {
  const solver = new RoomModeSolver();
  assert.throws(() => solver.solve({ geometryType: 'arbitrary' }, [20, 100]), /outside the current AcousticMate start scope/);
});
