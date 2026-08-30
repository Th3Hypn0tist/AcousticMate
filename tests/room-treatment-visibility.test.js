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

test('attached treatment XYZ resolves the nearest room wall without exposing wall selection', () => {
  const room = new RectangularRoom({ width: 6, height: 2.7, depth: 4.5 });
  const object = treatment('absorber-xyz', 'absorber', new Box({ id: 'absorber-xyz-geometry' }), 1);
  room.addAcousticObject(object);
  const editor = makeEditor(room);

  const attachment = editor.attachmentFromWorldPosition(object, [5.95, 1.35, 2.25]);

  assert.equal(attachment.wall, 'x-max');
  assert.equal(attachment.offset, 2);
  assert.equal(attachment.sillHeight, .85);
});

test('attached treatment XYZ update changes solver attachment and snaps presentation geometry to that surface', () => {
  const room = new RectangularRoom({ width: 6, height: 2.7, depth: 4.5 });
  const object = treatment('absorber-move', 'absorber', new Box({ id: 'absorber-move-geometry' }), 1);
  room.addAcousticObject(object);
  const editor = makeEditor(room);

  editor.updateAttachedObjectPosition(object, 0, 5.95);
  editor.updateAttachedObjectPosition(object, 2, 2.25);
  editor.updateAttachedObjectPosition(object, 1, 1.35);

  assert.equal(object.attachment.wall, 'x-max');
  assert.equal(object.attachment.offset, 2);
  assert.equal(object.attachment.sillHeight, .85);
  assert.deepEqual(object.geometry.position, [5.95, 1.35, 2.25]);
});

test('treatment gizmo position uses the same XYZ-to-attachment path as numeric editing', () => {
  const room = new RectangularRoom({ width: 6, height: 2.7, depth: 4.5 });
  const object = treatment('absorber-gizmo', 'absorber', new Box({ id: 'absorber-gizmo-geometry' }), 1);
  room.addAcousticObject(object);
  const editor = makeEditor(room);

  editor.wireAcousticObjectGizmo(object);
  object.geometry.gizmoSetPosition([5.95, 1.35, 2.25]);

  assert.equal(object.attachment.wall, 'x-max');
  assert.equal(object.attachment.offset, 2);
  assert.equal(object.attachment.sillHeight, .85);
  assert.deepEqual(object.geometry.position, [5.95, 1.35, 2.25]);
});

test('treatment gizmo rotation stays presentation-only', () => {
  const room = new RectangularRoom({ width: 6, height: 2.7, depth: 4.5 });
  const object = treatment('absorber-rotate', 'absorber', new Box({ id: 'absorber-rotate-geometry' }), 1);
  room.addAcousticObject(object);
  const editor = makeEditor(room);
  const attachment = { ...object.attachment };

  editor.wireAcousticObjectGizmo(object);
  object.geometry.gizmoSetRotation([.1, .2, .3]);

  assert.deepEqual(object.metadata.presentationRotation, [.1, .2, .3]);
  assert.deepEqual(object.geometry.rotation, [.1, .2, .3]);
  assert.deepEqual(object.attachment, attachment);
});
