import test from 'node:test';
import assert from 'node:assert/strict';
import { RectangularRoom } from '../src/room.js';
import { RoomEditor } from '../src/room-editor.js';

function sceneMock() {
  return {
    objects: new Set(),
    add(object) { this.objects.add(object); object.scene = this; return object; },
    remove(object) { this.objects.delete(object); if (object?.scene === this) object.scene = null; return object; },
  };
}

function makeEditor(room) {
  const scene = sceneMock();
  return new RoomEditor({
    room,
    scene,
    camera: { position: [5, 5, 5], target: [0, 0, 0] },
    roomOutline: { setPosition() {}, scale: [1, 1, 1] },
    field2DView: { setBounds() { return this; } },
    field3DView: { setBounds() { return this; }, setSlice() { return this; } },
    roomField: { setRoom() { return this; }, setOpenings() { return this; }, setAcousticObjects() { return this; } },
    dimensions: room.dimensions,
  });
}

test('RoomEditor transaction restore rolls dimensions, openings and measurements back', () => {
  const room = new RectangularRoom({ width: 6, height: 2.7, depth: 4.5 });
  room.addOpening({ id: 'door', wall: 'z-min', offset: 1, width: .9, height: 2.1 });
  const editor = makeEditor(room);
  const snapshot = editor.captureTransaction();

  room.updateOpening('door', { width: 1.2 });
  room.setDimensions({ width: 7 });
  editor.geometryWorkflow.setMeasurement('room-width-front', 7);
  editor.geometryWorkflow.addMeasurementFromAnchors({ id: 'extra', anchors: [{ type: 'free', position: [0, 0] }, { type: 'free', position: [1, 1] }] });

  editor.restoreTransaction(snapshot);
  assert.equal(room.dimensions.width, 6);
  assert.equal(room.openings.length, 1);
  assert.equal(room.openings[0].width, .9);
  assert.deepEqual(editor.geometryWorkflow.measurements.map(item => item.id), ['room-width-front', 'room-depth-right']);
  assert.equal(editor.geometryWorkflow.measurement('room-width-front').value, 6);
});

test('RoomEditor exposes explicit dimension contract methods', () => {
  const room = new RectangularRoom({ width: 6, height: 2.7, depth: 4.5 });
  const editor = makeEditor(room);
  editor.setWidth(5.5).setDepth(4).setHeight(2.5);
  assert.deepEqual(room.dimensions, { width: 5.5, height: 2.5, depth: 4 });
});
