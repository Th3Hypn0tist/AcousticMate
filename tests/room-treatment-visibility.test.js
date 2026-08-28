import test from 'node:test';
import assert from 'node:assert/strict';
import { Box, Cylinder } from '../vendor/S3D/s3d.js';
import { AcousticObject } from '../src/acoustic-object.js';
import { RectangularRoom } from '../src/room.js';
import { RoomEditor } from '../src/room-editor.js';

function sceneMock() {
  return {
    objects: new Set(),
    add(object) { this.objects.add(object); object.scene = this; return object; },
    remove(object) { this.objects.delete(object); if (object?.scene === this) object.scene = null; return object; },
  };
}

function treatment(id, type, geometry, offset) {
  return new AcousticObject({
    id,
    type,
    geometry,
    acousticModel: 'absorptive',
    attachment: { wall: 'z-min', offset, width: .5, height: 1, sillHeight: .5 },
    metadata: { thickness: type === 'bass-trap' ? .5 : .1 },
  });
}

function makeEditor(room) {
  return new RoomEditor({
    room,
    scene: sceneMock(),
    camera: { position: [5, 5, 5], target: [0, 0, 0] },
    roomOutline: { setPosition() {}, scale: [1, 1, 1] },
    field2DView: { setBounds() { return this; } },
    field3DView: { setBounds() { return this; }, setSlice() { return this; } },
    roomField: { setRoom() { return this; }, setOpenings() { return this; }, setAcousticObjects() { return this; } },
    dimensions: room.dimensions,
  });
}

test('room treatments remain visible when RoomEditor markers are hidden', () => {
  const room = new RectangularRoom({ width: 6, height: 2.7, depth: 4.5 });
  room.addOpening({ id: 'door', wall: 'z-min', offset: 3, width: .9, height: 2.1 });
  const absorber = treatment('absorber-1', 'absorber', new Box({ id: 'absorber-geometry', visible: false }), .5);
  const bassTrap = treatment('bass-trap-1', 'bass-trap', new Cylinder({ id: 'bass-trap-geometry', visible: false }), 1.5);
  room.addAcousticObject(absorber);
  room.addAcousticObject(bassTrap);

  const editor = makeEditor(room);
  const openingMarker = editor.markers.get('door');

  assert.equal(absorber.geometry.visible, true);
  assert.equal(bassTrap.geometry.visible, true);

  editor.setMarkerVisibility(true);
  assert.equal(openingMarker.visible, true);
  editor.setMarkerVisibility(false);

  assert.equal(openingMarker.visible, false);
  assert.equal(absorber.geometry.visible, true);
  assert.equal(bassTrap.geometry.visible, true);
});

test('RoomEditor transaction restores free-standing treatment transform and presentation rotation', () => {
  const room = new RectangularRoom({ width: 6, height: 2.7, depth: 4.5 });
  const geometry = new Box({ id: 'free-treatment-geometry', position: [1, .7, 2], scale: [.4, .3, .2] });
  const object = new AcousticObject({ id: 'free-treatment', type: 'absorber', geometry, acousticModel: 'absorptive', attachment: null });
  room.addAcousticObject(object);
  const editor = makeEditor(room);
  const snapshot = editor.captureTransaction();

  geometry.setPosition([3, 1.5, 1]);
  geometry.scale = [1, 1, 1];
  object.setPresentationRotation([.2, .4, .6]);
  editor.restoreTransaction(snapshot);

  assert.equal(object.attachment, null);
  assert.deepEqual(geometry.position, [1, .7, 2]);
  assert.deepEqual(geometry.scale, [.4, .3, .2]);
  assert.deepEqual(geometry.rotation, [0, 0, 0]);
});
