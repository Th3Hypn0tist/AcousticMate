import test from 'node:test';
import assert from 'node:assert/strict';
import { attachmentForWorldPosition, eulerRadiansToQuaternion, quaternionToEulerRadians } from '../src/gizmo-runtime.js';
import { AcousticObject } from '../src/acoustic-object.js';
import { RectangularRoom } from '../src/room.js';
import { Box } from '../vendor/S3D/s3d.js';

function treatment(id, wall, offset = 1, sillHeight = .4) {
  return new AcousticObject({
    id,
    type: 'bass-trap',
    geometry: new Box({ id: `${id}-geometry` }),
    acousticModel: 'absorptive',
    attachment: { wall, offset, width: .5, height: 1, sillHeight },
  });
}

test('z-wall treatment gizmo position maps X and Y into boundary attachment', () => {
  const room = new RectangularRoom({ width: 6, height: 2.7, depth: 4.5 });
  const object = treatment('trap-z', 'z-min');
  room.addAcousticObject(object);
  const next = attachmentForWorldPosition(object, room, [3, 1.5, 99]);
  assert.equal(next.offset, 2.75);
  assert.equal(next.sillHeight, 1);
  assert.equal(next.wall, 'z-min');
});

test('x-wall treatment gizmo position maps Z and Y and clamps to the wall', () => {
  const room = new RectangularRoom({ width: 6, height: 2.7, depth: 4.5 });
  const object = treatment('trap-x', 'x-max');
  room.addAcousticObject(object);
  const next = attachmentForWorldPosition(object, room, [99, 20, 99]);
  assert.equal(next.offset, 4);
  assert.equal(next.sillHeight, 1.7);
  assert.equal(next.wall, 'x-max');
});

test('gizmo Euler radians round-trip through speaker quaternion representation', () => {
  const source = [.2, -.45, .3];
  const roundTrip = quaternionToEulerRadians(eulerRadiansToQuaternion(source));
  for (let index = 0; index < 3; index++) assert.ok(Math.abs(roundTrip[index] - source[index]) < 1e-9);
});
