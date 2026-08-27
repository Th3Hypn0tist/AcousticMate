import test from 'node:test';
import assert from 'node:assert/strict';
import { RectangularRoom } from '../src/room.js';
import { RoomGeometryWorkflow } from '../src/room-geometry-workflow.js';

test('RoomGeometryWorkflow mirrors rectangular room and extrudes volume', () => {
  const room = new RectangularRoom({ width: 6, depth: 4.5, height: 2.7 });
  const workflow = new RoomGeometryWorkflow({ room });
  assert.equal(workflow.polygonEditor.vertices.length, 4);
  assert.equal(workflow.volume.surfaces.walls.length, 4);
  assert.equal(workflow.volume.height, 2.7);
});

test('RoomGeometryWorkflow solves authoritative width and depth measurements', () => {
  const room = new RectangularRoom({ width: 5.5, depth: 4, height: 2.5 });
  const workflow = new RoomGeometryWorkflow({ room });
  workflow.polygonEditor.moveVertex('room-v2', { x: 5.1, z: 0 });
  workflow.polygonEditor.moveVertex('room-v3', { x: 5.1, z: 3.7 });
  workflow.setMeasurement('room-width-front', 5.5);
  workflow.setMeasurement('room-depth-right', 4);
  const result = workflow.solve();
  assert.equal(result.polygon.vertices.length, 4);
  assert.ok(Math.abs(result.measurements[0].actual - 5.5) < .05);
  assert.ok(Math.abs(result.measurements[1].actual - 4) < .05);
});

test('RoomGeometryWorkflow refuses to coerce arbitrary polygon into rectangular solver', () => {
  const room = new RectangularRoom({ width: 6, depth: 4.5, height: 2.7 });
  const workflow = new RoomGeometryWorkflow({ room });
  workflow.polygonEditor.moveVertex('room-v3', { x: 5.4, z: 4.2 });
  assert.equal(workflow.isAxisAlignedRectangle(), false);
  assert.throws(() => workflow.commitRectangularRoom(), /axis-aligned rectangular polygon/);
});

test('RoomGeometryWorkflow exposes stable topology history operations', () => {
  const room = new RectangularRoom({ width: 6, depth: 4.5, height: 2.7 });
  const workflow = new RoomGeometryWorkflow({ room });
  const inserted = workflow.insertVertex('room-v1', { id: 'room-v1b', x: 3, z: 0 });
  assert.equal(inserted.id, 'room-v1b');
  assert.equal(workflow.polygonEditor.vertices.length, 5);
  assert.equal(workflow.undo(), true);
  assert.equal(workflow.polygonEditor.vertices.length, 4);
  assert.equal(workflow.redo(), true);
  assert.equal(workflow.polygonEditor.vertices.length, 5);
  workflow.removeVertex('room-v1b');
  assert.equal(workflow.polygonEditor.vertices.length, 4);
});

test('RoomGeometryWorkflow supports vertex edge and free measurement anchors', () => {
  const room = new RectangularRoom({ width: 6, depth: 4.5, height: 2.7 });
  const workflow = new RoomGeometryWorkflow({ room });
  const edge = workflow.polygonEditor.edges()[0];
  const measurement = workflow.addMeasurementFromAnchors({
    id: 'mixed-anchor-distance',
    anchors: [workflow.edgeAnchor(edge, .5), workflow.freeAnchor([3, 2])],
  });
  assert.equal(measurement.anchors[0].type, 'edge');
  assert.equal(measurement.anchors[1].type, 'free');
  assert.ok(Math.abs(measurement.value - 2) < 1e-9);
  workflow.setMeasurementAnchors('mixed-anchor-distance', [workflow.vertexAnchor('room-v1'), workflow.vertexAnchor('room-v2')]);
  assert.equal(workflow.measurement('mixed-anchor-distance').value, 6);
});

test('RoomGeometryWorkflow reference transform is absolute and round-trippable', () => {
  const room = new RectangularRoom({ width: 6, depth: 4.5, height: 2.7 });
  const workflow = new RoomGeometryWorkflow({ room });
  workflow.setReferencePosition(1.25, -.5);
  workflow.setReferenceRotation(Math.PI / 6);
  workflow.setReferenceScale(.02, .03);
  assert.deepEqual(workflow.referenceTransform(), {
    position: [1.25, -.5],
    rotation: Math.PI / 6,
    scale: [.02, .03],
  });
});
