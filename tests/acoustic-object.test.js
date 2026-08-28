import test from 'node:test';
import assert from 'node:assert/strict';
import { Box } from '../vendor/S3D/s3d.js';
import { AcousticMaterialProfile, AcousticObject } from '../src/acoustic-object.js';
import { RectangularRoom } from '../src/room.js';
import { RoomEditor } from '../src/room-editor.js';
import { RectangularRoomField, acousticObjectInverseQ } from '../src/rectangular-room-field.js';

test('AcousticObject accepts S3D primitive geometry and interpolates absorption', () => {
  const object = new AcousticObject({
    id: 'absorber-1', type: 'absorber', geometry: new Box({ id: 'absorber-geometry' }), acousticModel: 'absorptive',
    materialProfile: new AcousticMaterialProfile({ absorption: [[100, .2], [200, .8]] }),
    attachment: { wall: 'z-min', offset: 1, width: 1, height: .6, sillHeight: .5 },
  });
  assert.equal(object.absorptionAt(100), .2);
  assert.equal(object.absorptionAt(150), .5);
  assert.equal(object.absorptionAt(200), .8);
});

test('bass-trap acoustic identity is independent of primitive shape', () => {
  const boxTrap = new AcousticObject({
    id: 'bass-trap-box', type: 'bass-trap', geometry: new Box({ id: 'bass-trap-box-geometry' }), acousticModel: 'absorptive',
    materialProfile: { absorption: [[20, .7], [20000, .7]] },
    attachment: { wall: 'x-min', offset: .25, width: .5, height: 2, sillHeight: 0 },
  });
  assert.equal(boxTrap.type, 'bass-trap');
  assert.equal(boxTrap.geometry.primitive, 'box');
  assert.equal(boxTrap.geometry.acousticObject, boxTrap);
});

test('RoomEditor primitive creation never infers shape from acoustic type', () => {
  const boxTrap = RoomEditor.prototype.createAcousticGeometry.call({}, 'bass-trap', 'box', 'box-trap');
  const cylindricalAbsorber = RoomEditor.prototype.createAcousticGeometry.call({}, 'absorber', 'cylinder', 'cylindrical-absorber');
  assert.equal(boxTrap.primitive, 'box');
  assert.equal(cylindricalAbsorber.primitive, 'cylinder');
  assert.throws(() => RoomEditor.prototype.createAcousticGeometry.call({}, 'absorber', 'plane', 'invalid'));
});

test('AcousticObject presentation rotation persists through metadata and resets when absent', () => {
  const geometry = new Box({ id: 'rotating-treatment' });
  const object = new AcousticObject({ id: 'rotating-treatment', type: 'absorber', geometry, acousticModel: 'absorptive' });
  object.setPresentationRotation([.1, .2, .3]);
  assert.deepEqual(object.metadata.presentationRotation, [.1, .2, .3]);
  assert.deepEqual(geometry.rotation, [.1, .2, .3]);

  geometry.setRotation([1, 1, 1], { emit: false });
  object.syncPresentationGeometry();
  assert.deepEqual(geometry.rotation, [.1, .2, .3]);

  object.metadata = {};
  object.syncPresentationGeometry();
  assert.deepEqual(geometry.rotation, [0, 0, 0]);
});

test('RectangularRoom validates attached acoustic object patches and binds object to room', () => {
  const room = new RectangularRoom({ width: 4, height: 2.5, depth: 3 });
  const object = new AcousticObject({
    id: 'absorber-1', type: 'absorber', geometry: new Box({ id: 'absorber-geometry' }), acousticModel: 'absorptive',
    materialProfile: { absorption: [[20, .6], [20000, .6]] },
    attachment: { wall: 'z-min', offset: 1, width: 1, height: 1, sillHeight: .5 },
  });
  room.addAcousticObject(object);
  assert.equal(room.acousticObjects.length, 1);
  assert.equal(object.room, room);
  assert.throws(() => room.updateAcousticObject(object, { attachment: { wall: 'z-min', offset: 3.5, width: 1, height: 1, sillHeight: .5 } }));
  room.removeAcousticObject(object);
  assert.equal(object.room, null);
});

test('free-standing acoustic objects do not create wall boundary loss', () => {
  const dimensions = { width: 4, height: 2.5, depth: 3 };
  const mode = { nx: 1, ny: 0, nz: 0, frequency: 42.875 };
  const freeStanding = new AcousticObject({
    id: 'free-absorber', type: 'absorber', geometry: new Box({ id: 'free-absorber-geometry' }), acousticModel: 'absorptive',
    materialProfile: { absorption: [[20, 1], [20000, 1]] },
    attachment: null,
  });
  assert.equal(freeStanding.attachment, null);
  assert.equal(acousticObjectInverseQ(mode, [freeStanding], dimensions), 0);
});

test('absorptive object increases modal inverse Q while diffuser does not fake scattering loss', () => {
  const dimensions = { width: 4, height: 2.5, depth: 3 };
  const mode = { nx: 1, ny: 0, nz: 0, frequency: 42.875 };
  const absorber = new AcousticObject({
    id: 'absorber', type: 'absorber', geometry: new Box({ id: 'a' }), acousticModel: 'absorptive',
    materialProfile: { absorption: [[20, .8], [20000, .8]] },
    attachment: { wall: 'z-min', offset: 1, width: 1, height: 1, sillHeight: .5 },
  });
  const diffuser = new AcousticObject({
    id: 'diffuser', type: 'diffuser', geometry: new Box({ id: 'd' }), acousticModel: 'scattering',
    materialProfile: { scattering: [[20, .8], [20000, .8]] },
    attachment: { wall: 'z-min', offset: 1, width: 1, height: 1, sillHeight: .5 },
  });
  assert.ok(acousticObjectInverseQ(mode, [absorber], dimensions) > 0);
  assert.equal(acousticObjectInverseQ(mode, [diffuser], dimensions), 0);
  const field = new RectangularRoomField({ dimensions, acousticObjects: [absorber], maxFrequency: 100 });
  assert.equal(field.acousticObjects.length, 1);
});
