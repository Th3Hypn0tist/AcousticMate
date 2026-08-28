import { Box, Cylinder } from '../vendor/S3D/s3d.js';
import { AcousticMaterialProfile, AcousticObject } from './acoustic-object.js';
import { RoomGeometryWorkflow } from './room-geometry-workflow.js';

const WALL_OPTIONS = [
  ['z-min', 'Front wall'],
  ['z-max', 'Back wall'],
  ['x-min', 'Left wall'],
  ['x-max', 'Right wall'],
];

const TREATMENT_TYPE_OPTIONS = [
  ['absorber', 'Absorber'],
  ['diffuser', 'Diffuser'],
  ['bass-trap', 'Bass trap'],
];

const PRIMITIVE_OPTIONS = [
  ['box', 'Box'],
  ['cylinder', 'Cylinder'],
];

const TREATMENT_COLORS = {
  absorber: [.24, .72, .95, .72],
  diffuser: [.82, .58, .28, .78],
  'bass-trap': [.58, .38, .92, .82],
};

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function floorPoint(camera, canvas, event, y = .01) {
  const ray = camera.ray(event.clientX, event.clientY, canvas.getBoundingClientRect());
  if (Math.abs(ray.direction[1]) < 1e-9) return null;
  const distance = (y - ray.origin[1]) / ray.direction[1];
  if (distance < 0) return null;
  return ray.origin.map((value, index) => value + ray.direction[index] * distance);
}
function distanceXZ(point, value) { return Math.hypot(point[0] - value[0], point[2] - value[1]); }
function cloneAnchor(value) { return { type: value.type, target: value.target ?? null, t: value.t ?? null, position: value.position ? [...value.position] : null }; }
function cloneMeasurement(value) { return { id: value.id, anchors: value.anchors.map(cloneAnchor), value: value.value, confidence: value.confidence, source: value.source, unit: value.unit }; }

class RoomEditor {
  constructor({ gui, panel, room, scene, camera, canvas = null, roomOutline, field2DView, field3DView, roomField, dimensions, onOpen = null, onClose = null, onChanged = null } = {}) {
    Object.assign(this, { gui, panel, room, scene, camera, canvas, roomOutline, field2DView, field3DView, roomField, dimensions, onOpen, onClose, onChanged });
    this.openingSequence = room.openings.length;
    this.objectSequence = room.acousticObjects?.length ?? 0;
    this.newAcousticObjectType = 'absorber';
    this.newAcousticObjectPrimitive = 'box';
    this.markers = new Map();
    this.cameraSnapshot = null;
    this.transactionSnapshot = null;
    this.visible = false;
    this.geometryStatus = 'Current rectangular geometry is synchronized.';
    this.interactionMode = 'none';
    this.pointerDrag = null;
    this.pendingMeasurementAnchor = null;
    this.traceSequence = 0;
    this.measurementSequence = 0;
    this.geometryWorkflow = new RoomGeometryWorkflow({ room });
    this.geometryWorkflow.polygonEditor.visible = false;
    this.geometryWorkflow.volume.visible = false;
    this.scene.add(this.geometryWorkflow.polygonEditor);
    this.scene.add(this.geometryWorkflow.volume);
    this.geometryWorkflow.on('solved', result => {
      const maxError = Math.max(0, ...result.measurements.map(item => Math.abs(item.error)));
      this.geometryStatus = result.diagnostics.conflicts.length
        ? `Solved with ${result.diagnostics.conflicts.length} conflict(s), max error ${maxError.toFixed(3)} m.`
        : `Geometry solved, max measurement error ${maxError.toFixed(3)} m.`;
      if (this.visible) this.render();
    });
    this.geometryWorkflow.on('referenceError', event => { this.geometryStatus = `Reference image error: ${event.error?.message ?? event.error}`; if (this.visible) this.render(); });
    this.room.on('geometryChanged', () => this.applyRoomGeometry());
    this.room.on('openingAdded', () => this.applyOpenings());
    this.room.on('openingChanged', () => this.applyOpenings());
    this.room.on('openingRemoved', () => this.applyOpenings());
    this.room.on('acousticObjectAdded', () => this.applyAcousticObjects());
    this.room.on('acousticObjectChanged', () => this.applyAcousticObjects());
    this.room.on('acousticObjectRemoved', event => { this.scene.remove(event.object.geometry); this.applyAcousticObjects(); });
    this.bindCanvasInteraction();
    this.applyRoomGeometry();
    this.applyOpenings();
    this.applyAcousticObjects();
  }

  setWidth(value) { this.room.setDimensions({ width: value }); return this; }
  setDepth(value) { this.room.setDimensions({ depth: value }); return this; }
  setHeight(value) { this.room.setDimensions({ height: value }); return this; }
  addOpening(value = null) {
    if (value) return this.room.addOpening(value);
    const wall = 'z-min';
    const width = Math.min(.9, this.room.wallSpan(wall) * .5);
    const height = Math.min(2.1, this.room.dimensions.height);
    const offset = Math.max(0, (this.room.wallSpan(wall) - width) / 2);
    return this.room.addOpening({ id: `opening-${++this.openingSequence}`, wall, offset, width, height, sillHeight: 0, type: 'open', transmission: 1 });
  }
  updateOpening(ref, values) { return this.room.updateOpening(ref, values); }
  removeOpening(ref) { return this.room.removeOpening(ref); }

  captureTransaction() {
    const reference = this.geometryWorkflow.referenceLayer;
    return {
      dimensions: { ...this.room.dimensions },
      openings: this.room.openings.map(opening => ({ id: opening.id, wall: opening.wall, offset: opening.offset, width: opening.width, height: opening.height, sillHeight: opening.sillHeight, type: opening.type, transmission: opening.transmission })),
      acousticObjects: (this.room.acousticObjects ?? []).map(object => ({ object, attachment: object.attachment ? { ...object.attachment } : null, acousticModel: object.acousticModel, materialProfile: object.materialProfile, metadata: { ...object.metadata }, position: [...object.geometry.position], scale: [...object.geometry.scale] })),
      polygon: this.geometryWorkflow.polygonEditor.snapshot(),
      measurements: this.geometryWorkflow.measurements.map(cloneMeasurement),
      reference: {
        image: reference.image,
        name: this.geometryWorkflow.referenceName,
        opacity: reference.opacity,
        visible: reference.visible,
        transform: this.geometryWorkflow.referenceTransform(),
      },
    };
  }

  restoreTransaction(snapshot) {
    for (const object of [...(this.room.acousticObjects ?? [])]) this.room.removeAcousticObject(object);
    for (const opening of [...this.room.openings]) this.room.removeOpening(opening);
    this.room.setDimensions(snapshot.dimensions);
    for (const opening of snapshot.openings) this.room.addOpening(opening);
    for (const item of snapshot.acousticObjects) {
      item.object.setAttachment(item.attachment);
      item.object.setAcousticModel(item.acousticModel);
      item.object.setMaterialProfile(item.materialProfile);
      item.object.metadata = { ...item.metadata };
      item.object.geometry.setPosition(item.position, { emit: false });
      item.object.geometry.scale = [...item.scale];
      if (!item.object.geometry.scene) this.scene.add(item.object.geometry);
      this.room.addAcousticObject(item.object);
    }
    this.geometryWorkflow.polygonEditor.restore(snapshot.polygon);
    this.geometryWorkflow.syncVolume();
    this.geometryWorkflow.measurements = snapshot.measurements.map(value => this.geometryWorkflow.addMeasurement(value)).slice(-snapshot.measurements.length);
    this.geometryWorkflow.measurements.splice(0, this.geometryWorkflow.measurements.length - snapshot.measurements.length);
    this.geometryWorkflow.referenceName = snapshot.reference.name;
    this.geometryWorkflow.referenceLayer.setImage(snapshot.reference.image).setOpacity(snapshot.reference.opacity).setTransform(snapshot.reference.transform);
    if (snapshot.reference.visible) this.geometryWorkflow.referenceLayer.show(); else this.geometryWorkflow.referenceLayer.hide();
    this.applyRoomGeometry();
    this.geometryStatus = 'Changes cancelled; restored room state from editor open.';
  }

  bindCanvasInteraction() {
    if (!this.canvas) return;
    this.onCanvasPointerDown = event => {
      if (!this.visible || event.button !== 0 || this.interactionMode === 'none') return;
      const point = floorPoint(this.camera, this.canvas, event);
      if (!point) return;
      if (this.interactionMode === 'trace') {
        const vertex = this.geometryWorkflow.addVertex({ id: `trace-v-${++this.traceSequence}`, x: point[0], z: point[2] });
        this.geometryWorkflow.polygonEditor.select(vertex);
        this.geometryStatus = `Tracing: ${this.geometryWorkflow.polygonEditor.vertices.length} vertices. Click around the room, then close polygon.`;
        this.render();
        event.preventDefault();
        return;
      }
      if (this.interactionMode === 'measure') {
        this.captureMeasurementAnchor(this.anchorAtPoint(point));
        event.preventDefault();
        return;
      }
      if (this.interactionMode === 'edit') {
        const vertex = this.nearestVertex(point);
        if (!vertex) return;
        this.pointerDrag = { id: event.pointerId, vertex };
        this.geometryWorkflow.polygonEditor.select(vertex);
        this.canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
      }
    };
    this.onCanvasPointerMove = event => {
      if (!this.visible || !this.pointerDrag || event.pointerId !== this.pointerDrag.id) return;
      const point = floorPoint(this.camera, this.canvas, event);
      if (!point) return;
      this.geometryWorkflow.polygonEditor.moveVertex(this.pointerDrag.vertex, { x: point[0], z: point[2] });
      this.geometryWorkflow.syncVolume();
      event.preventDefault();
    };
    this.onCanvasPointerUp = event => {
      if (!this.pointerDrag || event.pointerId !== this.pointerDrag.id) return;
      this.pointerDrag = null;
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
      this.geometryStatus = 'Polygon vertex moved. Solve measured geometry to reconcile authoritative dimensions.';
      this.render();
    };
    this.canvas.addEventListener('pointerdown', this.onCanvasPointerDown);
    this.canvas.addEventListener('pointermove', this.onCanvasPointerMove);
    this.canvas.addEventListener('pointerup', this.onCanvasPointerUp);
    this.canvas.addEventListener('pointercancel', this.onCanvasPointerUp);
  }

  interactionThreshold() { return Math.max(.12, Math.min(this.room.dimensions.width, this.room.dimensions.depth) * .05); }
  nearestVertex(point) {
    let best = null;
    for (const vertex of this.geometryWorkflow.polygonEditor.vertices) {
      const distance = distanceXZ(point, [vertex.x, vertex.z]);
      if (distance <= this.interactionThreshold() && (!best || distance < best.distance)) best = { vertex, distance };
    }
    return best?.vertex ?? null;
  }
  nearestEdge(point) {
    let best = null;
    for (const edge of this.geometryWorkflow.polygonEditor.edges()) {
      const ax = edge.start.x, az = edge.start.z, bx = edge.end.x, bz = edge.end.z;
      const dx = bx - ax, dz = bz - az;
      const denominator = dx * dx + dz * dz || 1;
      const t = clamp(((point[0] - ax) * dx + (point[2] - az) * dz) / denominator, 0, 1);
      const position = [ax + dx * t, az + dz * t];
      const distance = distanceXZ(point, position);
      if (distance <= this.interactionThreshold() && (!best || distance < best.distance)) best = { edge, t, distance, position };
    }
    return best;
  }
  anchorAtPoint(point) {
    const vertex = this.nearestVertex(point);
    if (vertex) return { type: 'vertex', target: vertex.id };
    const edge = this.nearestEdge(point);
    if (edge) return { type: 'edge', target: edge.edge.id, t: edge.t };
    return { type: 'free', position: [point[0], point[2]] };
  }

  setInteractionMode(mode) {
    if (!['none', 'trace', 'edit', 'measure'].includes(mode)) throw new Error(`Unknown room interaction mode: ${mode}`);
    this.interactionMode = mode;
    this.pointerDrag = null;
    if (mode !== 'measure') this.pendingMeasurementAnchor = null;
    if (this.visible) this.render();
    return this;
  }
  startTracing() { this.geometryWorkflow.polygonEditor.restore({ vertices: [], closed: false, selection: [] }); this.geometryWorkflow.volume.visible = false; this.traceSequence = 0; this.geometryStatus = 'Trace mode: LMB places room vertices on the floor plane. RMB still orbits.'; this.setInteractionMode('trace'); }
  closeTracing() { const editor = this.geometryWorkflow.polygonEditor; if (editor.vertices.length < 3) { this.geometryStatus = 'At least three vertices are required before closing the polygon.'; this.render(); return; } editor.closePolygon(); this.geometryWorkflow.syncVolume(); this.geometryWorkflow.volume.visible = this.visible; this.geometryStatus = 'Polygon closed. Add measurements or edit vertices, then solve.'; this.setInteractionMode('edit'); }
  cancelTracing() { this.geometryWorkflow.syncFromRoom(); this.geometryWorkflow.volume.visible = this.visible; this.geometryStatus = 'Tracing cancelled; restored current room geometry.'; this.setInteractionMode('none'); }

  captureMeasurementAnchor(anchor) {
    if (!this.pendingMeasurementAnchor) {
      this.pendingMeasurementAnchor = cloneAnchor(anchor);
      this.geometryStatus = `Measure mode: first ${anchor.type} anchor selected. Click the second point.`;
      this.render();
      return;
    }
    const first = this.pendingMeasurementAnchor;
    this.pendingMeasurementAnchor = null;
    try {
      const measurement = this.geometryWorkflow.addMeasurementFromAnchors({ id: `measurement-${++this.measurementSequence}`, anchors: [first, anchor], source: 'drawing', confidence: .5 });
      this.geometryStatus = `Measurement ${measurement.id} created from drawing (${measurement.value.toFixed(3)} m). Enter the measured value to make it authoritative.`;
    } catch (error) { this.geometryStatus = error.message; }
    this.render();
  }

  setMarkerVisibility(value) {
    const visible = Boolean(value);
    for (const marker of this.markers.values()) marker.visible = visible;
    for (const object of this.room.acousticObjects ?? []) object.geometry.visible = true;
    this.geometryWorkflow.polygonEditor.visible = visible;
    this.geometryWorkflow.volume.visible = visible && this.geometryWorkflow.polygonEditor.closed;
  }
  applyRoomGeometry() {
    const { width, height, depth } = this.room.dimensions;
    Object.assign(this.dimensions, this.room.dimensions);
    this.roomOutline.setPosition([width / 2, height / 2, depth / 2], { emit: false });
    this.roomOutline.scale = [width / 2, height / 2, depth / 2];
    this.field2DView.setBounds({ min: [0, .035, 0], max: [width, .035, depth] });
    this.field3DView.setBounds({ min: [0, 0, 0], max: [width, height, depth] });
    this.field3DView.setSlice('x', width / 2); this.field3DView.setSlice('y', height / 2); this.field3DView.setSlice('z', depth / 2);
    this.roomField.setRoom(this.room);
    this.applyOpenings(); this.applyAcousticObjects(); this.onChanged?.(this.room);
  }
  markerFor(opening) {
    let marker = this.markers.get(opening.id);
    if (marker) return marker;
    marker = new Box({ id: `room-opening-${opening.id}`, position: [0, 0, 0], scale: [.02, .5, .5], color: [.2, .95, .72, .32], outline: false, selectable: false, visible: this.visible });
    this.markers.set(opening.id, marker); this.scene.add(marker); return marker;
  }
  applyOpenings() {
    const activeIds = new Set(this.room.openings.map(opening => opening.id));
    for (const [id, marker] of this.markers) if (!activeIds.has(id)) { this.scene.remove(marker); this.markers.delete(id); }
    for (const opening of this.room.openings) { const marker = this.markerFor(opening); const { center, size } = this.room.openingRect(opening); const thickness = .035; marker.setPosition(center, { emit: false }); marker.scale = [size[0] ? size[0] / 2 : thickness, size[1] / 2, size[2] ? size[2] / 2 : thickness]; marker.visible = this.visible; }
    this.roomField.setOpenings(this.room.openings); this.onChanged?.(this.room); if (this.visible) this.render();
  }
  positionAcousticObject(object) {
    object.geometry.color = [...(TREATMENT_COLORS[object.type] ?? [.65, .65, .65, .75])];
    object.geometry.visible = true;
    object.syncPresentationGeometry?.();
    if (!object.attachment) return;
    const rect = this.room.acousticObjectRect(object); if (!rect) return;
    const thickness = Math.max(.02, Number(object.metadata?.thickness ?? .1));
    object.geometry.setPosition(rect.center.map((value, axis) => value + rect.normal[axis] * thickness / 2), { emit: false });
    if (object.geometry.primitive === 'cylinder') { const radius = object.attachment.width / 2; object.geometry.scale = [radius, object.attachment.height / 2, radius]; }
    else if (object.attachment.wall.startsWith('x-')) object.geometry.scale = [thickness / 2, object.attachment.height / 2, object.attachment.width / 2];
    else object.geometry.scale = [object.attachment.width / 2, object.attachment.height / 2, thickness / 2];
  }
  applyAcousticObjects() { for (const object of this.room.acousticObjects ?? []) { if (!object.geometry.scene) this.scene.add(object.geometry); this.positionAcousticObject(object); } this.roomField.setAcousticObjects(this.room.acousticObjects ?? []); this.onChanged?.(this.room); if (this.visible) this.render(); }

  numberField(label, value, { min = -1e6, max = 1e6, step = .01, update } = {}) {
    const input = this.gui.input({ type: 'number', min, max, step, value, on: { change: event => { const next = Number(event.target.value); if (!Number.isFinite(next) || next < min || next > max) { event.target.setAttribute('aria-invalid', 'true'); return; } try { update(next); event.target.removeAttribute('aria-invalid'); event.target.removeAttribute('title'); } catch (error) { event.target.setAttribute('aria-invalid', 'true'); event.target.title = error.message; } } } });
    return this.gui.field(label, input, { className: 'compact-field' });
  }
  dimensionControls() { const d = this.room.dimensions; return this.gui.h('fieldset', { className: 'set-helper' }, [this.gui.h('legend', { text: 'Room dimensions' }), this.numberField('Width (m)', d.width, { min: .5, max: 100, update: value => this.setWidth(value) }), this.numberField('Depth (m)', d.depth, { min: .5, max: 100, update: value => this.setDepth(value) }), this.numberField('Height (m)', d.height, { min: .5, max: 30, update: value => this.setHeight(value) })]); }

  anchorEditor(measurement, anchorIndex) {
    const workflow = this.geometryWorkflow;
    const anchor = measurement.anchors[anchorIndex];
    const type = this.gui.select({ value: anchor.type, on: { change: event => {
      const next = event.target.value;
      let replacement;
      if (next === 'vertex') replacement = { type: 'vertex', target: workflow.polygonEditor.vertices[0]?.id ?? null };
      else if (next === 'edge') replacement = { type: 'edge', target: workflow.polygonEditor.edges()[0]?.id ?? null, t: .5 };
      else replacement = { type: 'free', position: [0, 0] };
      const anchors = measurement.anchors.map(cloneAnchor); anchors[anchorIndex] = replacement;
      workflow.setMeasurementAnchors(measurement.id, anchors, { preserveValue: measurement.source === 'measured' }); this.render();
    } } }, ['vertex', 'edge', 'free'].map(value => this.gui.option(value, value)));
    const controls = [this.gui.field(`Anchor ${anchorIndex + 1} type`, type, { className: 'compact-field' })];
    if (anchor.type === 'vertex') {
      const target = this.gui.select({ value: anchor.target, on: { change: event => { const anchors = measurement.anchors.map(cloneAnchor); anchors[anchorIndex] = { type: 'vertex', target: event.target.value }; workflow.setMeasurementAnchors(measurement.id, anchors, { preserveValue: measurement.source === 'measured' }); this.render(); } } }, workflow.polygonEditor.vertices.map(vertex => this.gui.option(vertex.id, vertex.id)));
      controls.push(this.gui.field('Vertex', target, { className: 'compact-field' }));
    } else if (anchor.type === 'edge') {
      const target = this.gui.select({ value: anchor.target, on: { change: event => { const anchors = measurement.anchors.map(cloneAnchor); anchors[anchorIndex] = { type: 'edge', target: event.target.value, t: anchor.t ?? .5 }; workflow.setMeasurementAnchors(measurement.id, anchors, { preserveValue: measurement.source === 'measured' }); this.render(); } } }, workflow.polygonEditor.edges().map(edge => this.gui.option(edge.id, edge.id)));
      controls.push(this.gui.field('Edge', target, { className: 'compact-field' }));
      controls.push(this.numberField('Edge position t', anchor.t ?? .5, { min: 0, max: 1, step: .01, update: value => { const anchors = measurement.anchors.map(cloneAnchor); anchors[anchorIndex] = { ...anchor, t: value }; workflow.setMeasurementAnchors(measurement.id, anchors, { preserveValue: measurement.source === 'measured' }); } }));
    } else {
      controls.push(this.numberField('Free X', anchor.position?.[0] ?? 0, { update: value => { const anchors = measurement.anchors.map(cloneAnchor); anchors[anchorIndex] = { type: 'free', position: [value, anchor.position?.[1] ?? 0] }; workflow.setMeasurementAnchors(measurement.id, anchors, { preserveValue: measurement.source === 'measured' }); } }));
      controls.push(this.numberField('Free Z', anchor.position?.[1] ?? 0, { update: value => { const anchors = measurement.anchors.map(cloneAnchor); anchors[anchorIndex] = { type: 'free', position: [anchor.position?.[0] ?? 0, value] }; workflow.setMeasurementAnchors(measurement.id, anchors, { preserveValue: measurement.source === 'measured' }); } }));
    }
    return this.gui.h('fieldset', { className: 'set-helper' }, controls);
  }

  measurementCard(measurement) {
    const remove = this.gui.button('Remove', { className: 'danger-button', on: { click: () => { this.geometryWorkflow.removeMeasurement(measurement.id); this.render(); } } });
    return this.gui.h('section', { className: 'speaker-card member-card' }, [
      this.gui.h('div', { className: 'speaker-heading' }, [this.gui.h('strong', { text: measurement.id }), remove]),
      this.gui.h('span', { className: 'model-name', text: `${measurement.anchors[0].type} → ${measurement.anchors[1].type} · ${measurement.source}` }),
      this.numberField('Distance (m)', measurement.value, { min: .001, max: 1000, update: value => { this.geometryWorkflow.setMeasurement(measurement.id, value, { source: 'measured', confidence: 1 }); this.geometryStatus = `${measurement.id} is now an authoritative measured constraint.`; this.render(); } }),
      this.anchorEditor(measurement, 0), this.anchorEditor(measurement, 1),
    ]);
  }

  geometryWorkflowControls() {
    const workflow = this.geometryWorkflow;
    const reference = workflow.referenceTransform();
    const referenceInput = this.gui.input({ type: 'file', accept: 'image/png,image/jpeg', on: { change: event => { const file = event.target.files?.[0] ?? null; if (!file) return; workflow.setReferenceImage(file); this.geometryStatus = `Reference loaded: ${file.name}. Image remains reference-only geometry.`; this.render(); } } });
    const vertices = workflow.polygonEditor.vertices.map((vertex, index) => this.gui.h('section', { className: 'speaker-card member-card' }, [
      this.gui.h('div', { className: 'speaker-heading' }, [this.gui.h('strong', { text: vertex.id }), this.gui.button('Remove', { className: 'danger-button', on: { click: () => { workflow.removeVertex(vertex); this.render(); } } })]),
      this.gui.h('div', { className: 'position-grid' }, [this.numberField('X (m)', vertex.x, { update: value => workflow.polygonEditor.moveVertex(vertex, { x: value, z: vertex.z }) }), this.numberField('Z (m)', vertex.z, { update: value => workflow.polygonEditor.moveVertex(vertex, { x: vertex.x, z: value }) })]),
      this.gui.button('Insert vertex after', { on: { click: () => { const next = workflow.polygonEditor.vertices[(index + 1) % workflow.polygonEditor.vertices.length] ?? vertex; workflow.insertVertexAfter(vertex, { x: (vertex.x + next.x) / 2, z: (vertex.z + next.z) / 2 }); this.render(); } } }),
    ]));
    const solve = () => { try { const result = workflow.solve(); if (workflow.isAxisAlignedRectangle()) { workflow.commitRectangularRoom(); this.geometryStatus = result.diagnostics.conflicts.length ? `Solved and committed rectangular geometry with ${result.diagnostics.conflicts.length} conflict(s).` : 'Solved geometry committed to rectangular room.'; } else this.geometryStatus = 'Polygon solved, but current analytical room solver only accepts an axis-aligned rectangle. Geometry was not silently coerced.'; } catch (error) { this.geometryStatus = error.message; } this.render(); };
    return this.gui.h('details', { className: 'signal-chain', open: true }, [
      this.gui.h('summary', { text: 'Geometry workflow' }),
      this.gui.field('Reference JPG/PNG', referenceInput), this.gui.h('span', { className: 'model-name', text: workflow.referenceName ?? 'No reference image' }),
      this.numberField('Reference opacity', workflow.referenceLayer.opacity, { min: 0, max: 1, step: .05, update: value => workflow.setReferenceOpacity(value) }),
      this.gui.h('div', { className: 'position-grid' }, [this.numberField('Reference X', reference.position[0], { update: value => workflow.setReferencePosition(value, reference.position[1]) }), this.numberField('Reference Z', reference.position[1], { update: value => workflow.setReferencePosition(reference.position[0], value) })]),
      this.numberField('Reference rotation (°)', reference.rotation * 180 / Math.PI, { min: -360, max: 360, step: .5, update: value => workflow.setReferenceRotation(value * Math.PI / 180) }),
      this.gui.h('div', { className: 'position-grid' }, [this.numberField('Reference scale X', reference.scale[0], { min: .000001, max: 1000, update: value => workflow.setReferenceScale(value, reference.scale[1]) }), this.numberField('Reference scale Z', reference.scale[1], { min: .000001, max: 1000, update: value => workflow.setReferenceScale(reference.scale[0], value) })]),
      this.gui.row([this.gui.button('Trace polygon', { on: { click: () => this.startTracing() } }), this.gui.button('Edit vertices', { on: { click: () => this.setInteractionMode('edit') } }), this.gui.button('Measure', { on: { click: () => this.setInteractionMode('measure') } }), this.gui.button('Stop interaction', { on: { click: () => this.setInteractionMode('none') } })], { className: 'button-row' }),
      this.interactionMode === 'trace' ? this.gui.row([this.gui.button('Close polygon', { on: { click: () => this.closeTracing() } }), this.gui.button('Cancel tracing', { on: { click: () => this.cancelTracing() } })], { className: 'button-row' }) : null,
      this.gui.row([this.gui.button('Undo', { on: { click: () => { workflow.undo(); this.render(); } } }), this.gui.button('Redo', { on: { click: () => { workflow.redo(); this.render(); } } }), workflow.polygonEditor.closed ? this.gui.button('Open polygon', { on: { click: () => { workflow.polygonEditor.openPolygon(); workflow.syncVolume(); this.render(); } } }) : this.gui.button('Close polygon', { on: { click: () => { if (workflow.polygonEditor.vertices.length >= 3) workflow.polygonEditor.closePolygon(); workflow.syncVolume(); this.render(); } } })], { className: 'button-row' }),
      this.gui.h('span', { className: 'coordinates', text: `Interaction: ${this.interactionMode}` }),
      this.gui.h('h3', { text: 'Polygon vertices' }), this.gui.h('div', { className: 'member-list' }, vertices),
      this.gui.h('h3', { text: 'Measurements' }), this.gui.h('div', { className: 'member-list' }, workflow.measurements.map(measurement => this.measurementCard(measurement))),
      this.gui.button('Solve measured geometry', { on: { click: solve } }), this.gui.h('p', { className: 'hint', text: this.geometryStatus }),
    ].filter(Boolean));
  }

  openingCard(opening) {
    const wall = this.gui.select({ value: opening.wall, on: { change: event => { const nextWall = event.target.value; const maxOffset = Math.max(0, this.room.wallSpan(nextWall) - opening.width); this.updateOpening(opening, { wall: nextWall, offset: clamp(opening.offset, 0, maxOffset) }); } } }, WALL_OPTIONS.map(([value, text]) => this.gui.option(value, text)));
    return this.gui.h('section', { className: 'speaker-card room-opening-card' }, [this.gui.h('div', { className: 'speaker-heading' }, [this.gui.h('strong', { text: opening.id }), this.gui.button('Remove opening', { className: 'danger-button', on: { click: () => this.removeOpening(opening) } })]), this.gui.field('Wall', wall, { className: 'compact-field' }), this.gui.h('div', { className: 'position-grid' }, [this.numberField('Offset (m)', opening.offset, { min: 0, max: 100, update: value => this.updateOpening(opening, { offset: value }) }), this.numberField('Width (m)', opening.width, { min: .1, max: 20, update: value => this.updateOpening(opening, { width: value }) }), this.numberField('Height (m)', opening.height, { min: .1, max: 20, update: value => this.updateOpening(opening, { height: value }) })]), this.numberField('Sill height (m)', opening.sillHeight, { min: 0, max: 20, update: value => this.updateOpening(opening, { sillHeight: value }) }), this.numberField('Transmission', opening.transmission, { min: 0, max: 1, step: .01, update: value => this.updateOpening(opening, { transmission: value }) }), this.gui.h('p', { className: 'hint', text: 'Open boundary: energy crossing this aperture leaves the solved room. Exterior geometry is not calculated.' })]);
  }

  treatmentProfile(type, coefficient = null) { if (type === 'diffuser') { const value = coefficient ?? .65; return new AcousticMaterialProfile({ scattering: [[20, value], [20000, value]] }); } const value = coefficient ?? (type === 'bass-trap' ? .55 : .75); return new AcousticMaterialProfile({ absorption: [[20, value], [20000, value]] }); }
  createAcousticGeometry(type, primitive, id) {
    const options = { id: `${id}-geometry`, color: TREATMENT_COLORS[type], selectable: false, visible: true };
    if (primitive === 'box') return new Box(options);
    if (primitive === 'cylinder') return new Cylinder({ ...options, segments: 20 });
    throw new Error(`Unsupported acoustic object primitive: ${primitive}`);
  }
  addAcousticObject(type = 'absorber', primitive = 'box') {
    const wall = 'z-min';
    const width = type === 'bass-trap' ? .5 : Math.min(1.2, this.room.wallSpan(wall) * .5);
    const height = Math.min(type === 'bass-trap' ? 2 : .6, this.room.dimensions.height);
    const sillHeight = Math.max(0, Math.min(.8, this.room.dimensions.height - height));
    const offset = Math.max(0, (this.room.wallSpan(wall) - width) / 2);
    const id = `${type}-${++this.objectSequence}`;
    const geometry = this.createAcousticGeometry(type, primitive, id);
    const object = new AcousticObject({ id, type, geometry, acousticModel: type === 'diffuser' ? 'scattering' : 'absorptive', materialProfile: this.treatmentProfile(type), attachment: { wall, offset, width, height, sillHeight }, metadata: { thickness: type === 'bass-trap' ? width : .1 } });
    this.scene.add(geometry);
    try { return this.room.addAcousticObject(object); }
    catch (error) { this.scene.remove(geometry); throw error; }
  }
  acousticObjectCard(object) {
    const coefficient = object.type === 'diffuser' ? object.scatteringAt(1000) : object.absorptionAt(125);
    const common = [
      this.gui.h('div', { className: 'speaker-heading' }, [this.gui.h('strong', { text: object.id }), this.gui.button('Remove', { className: 'danger-button', on: { click: () => this.room.removeAcousticObject(object) } })]),
      this.gui.h('span', { className: 'model-name', text: `${object.type} · ${object.geometry.primitive} · ${object.acousticModel}` }),
    ];
    if (!object.attachment) {
      const updatePosition = axis => value => {
        const position = [...object.geometry.position];
        position[axis] = value;
        object.geometry.setPosition(position);
        this.onChanged?.(this.room);
      };
      const updateScale = axis => value => {
        const scale = [...object.geometry.scale];
        scale[axis] = value;
        object.geometry.scale = scale;
        this.onChanged?.(this.room);
      };
      return this.gui.h('section', { className: 'speaker-card treatment-card' }, [
        ...common,
        this.gui.h('span', { className: 'coordinates', text: 'Free-standing · no room-surface boundary patch' }),
        this.gui.h('div', { className: 'position-grid' }, [0, 1, 2].map(axis => this.numberField(['X (m)', 'Y (m)', 'Z (m)'][axis], object.geometry.position[axis], { update: updatePosition(axis) }))),
        this.gui.h('div', { className: 'position-grid' }, [0, 1, 2].map(axis => this.numberField(['Scale X', 'Scale Y', 'Scale Z'][axis], object.geometry.scale[axis], { min: .001, max: 100, update: updateScale(axis) }))),
        this.numberField(object.type === 'diffuser' ? 'Scattering' : 'Absorption', coefficient, { min: 0, max: 1, step: .01, update: value => this.room.updateAcousticObject(object, { materialProfile: this.treatmentProfile(object.type, value) }) }),
        this.gui.h('p', { className: 'hint', text: 'Free-standing geometry remains movable/rotatable, but the current rectangular modal solver does not convert it into wall-boundary loss without an attachment.' }),
      ]);
    }
    const attachment = object.attachment;
    const wall = this.gui.select({ value: attachment.wall, on: { change: event => { const nextWall = event.target.value; const maxOffset = Math.max(0, this.room.wallSpan(nextWall) - attachment.width); this.room.updateAcousticObject(object, { attachment: { ...object.attachment, wall: nextWall, offset: clamp(attachment.offset, 0, maxOffset) } }); } } }, WALL_OPTIONS.map(([value, text]) => this.gui.option(value, text)));
    const updateAttachment = key => value => this.room.updateAcousticObject(object, { attachment: { ...object.attachment, [key]: value } });
    return this.gui.h('section', { className: 'speaker-card treatment-card' }, [
      ...common,
      this.gui.field('Wall', wall, { className: 'compact-field' }),
      this.gui.h('div', { className: 'position-grid' }, [this.numberField('Offset (m)', attachment.offset, { min: 0, max: 100, update: updateAttachment('offset') }), this.numberField('Width (m)', attachment.width, { min: .05, max: 20, update: updateAttachment('width') }), this.numberField('Height (m)', attachment.height, { min: .05, max: 20, update: updateAttachment('height') })]),
      this.numberField('Bottom (m)', attachment.sillHeight, { min: 0, max: 20, update: updateAttachment('sillHeight') }),
      this.numberField('Thickness (m)', Number(object.metadata.thickness ?? .1), { min: .02, max: 5, update: value => { object.metadata.thickness = value; this.applyAcousticObjects(); } }),
      this.numberField(object.type === 'diffuser' ? 'Scattering' : 'Absorption', coefficient, { min: 0, max: 1, step: .01, update: value => this.room.updateAcousticObject(object, { materialProfile: this.treatmentProfile(object.type, value) }) }),
      object.type === 'diffuser' ? this.gui.h('p', { className: 'hint', text: 'Current modal solver represents this scattering boundary but does not claim exact diffuser scattering.' }) : this.gui.h('p', { className: 'hint', text: 'Absorption contributes mode-dependent boundary loss at the attached wall area.' }),
    ]);
  }

  acousticObjectCreateControls() {
    const type = this.gui.select({ value: this.newAcousticObjectType, on: { change: event => { this.newAcousticObjectType = event.target.value; } } }, TREATMENT_TYPE_OPTIONS.map(([value, text]) => this.gui.option(value, text)));
    const primitive = this.gui.select({ value: this.newAcousticObjectPrimitive, on: { change: event => { this.newAcousticObjectPrimitive = event.target.value; } } }, PRIMITIVE_OPTIONS.map(([value, text]) => this.gui.option(value, text)));
    return this.gui.h('fieldset', { className: 'set-helper' }, [
      this.gui.h('legend', { text: 'Add acoustic object' }),
      this.gui.field('Acoustic type', type, { className: 'compact-field' }),
      this.gui.field('Primitive', primitive, { className: 'compact-field' }),
      this.gui.button('Add object', { on: { click: () => this.addAcousticObject(this.newAcousticObjectType, this.newAcousticObjectPrimitive) } }),
      this.gui.h('p', { className: 'hint', text: 'Acoustic behavior and S3D primitive geometry are independent. A bass trap may be a Box or Cylinder.' }),
    ]);
  }

  render() {
    if (!this.visible) return;
    this.gui.replace(this.panel, [
      this.gui.h('header', {}, [this.gui.h('h1', { text: 'Room Editor' }), this.gui.h('p', { text: 'Room geometry · boundaries · acoustic objects' })]),
      this.gui.row([this.gui.button('✓ Commit and return', { on: { click: () => this.commit() } }), this.gui.button('Cancel changes', { className: 'danger-button', on: { click: () => this.cancel() } })], { className: 'button-row' }),
      this.dimensionControls(), this.geometryWorkflowControls(),
      this.gui.h('div', { className: 'speaker-heading' }, [this.gui.h('h2', { text: 'Openings' }), this.gui.button('Add opening', { on: { click: () => this.addOpening() } })]), this.gui.h('div', { className: 'member-list' }, this.room.openings.map(opening => this.openingCard(opening))),
      this.gui.h('h2', { text: 'Acoustic objects' }), this.acousticObjectCreateControls(), this.gui.h('div', { className: 'member-list' }, (this.room.acousticObjects ?? []).map(object => this.acousticObjectCard(object))),
      this.gui.h('p', { className: 'hint', text: 'Openings and attached absorptive objects affect modal damping. Free-standing objects remain geometry-only for the current rectangular boundary-loss model. Diffusers remain explicit scattering objects; exact scattering is outside the current solver.' }),
    ]);
  }

  open() {
    if (this.visible) return this;
    this.visible = true;
    this.transactionSnapshot = this.captureTransaction();
    this.cameraSnapshot = { position: [...this.camera.position], target: [...this.camera.target] };
    const { width, height, depth } = this.room.dimensions;
    this.camera.position = [width * 1.15, height * 1.65, depth * 1.35]; this.camera.target = [width / 2, height / 2, depth / 2];
    this.panel.hidden = false; this.setMarkerVisibility(true); this.onOpen?.(); this.render(); return this;
  }
  finishClose() {
    this.visible = false; this.setInteractionMode('none'); this.panel.hidden = true; this.setMarkerVisibility(false);
    if (this.cameraSnapshot) { this.camera.position = [...this.cameraSnapshot.position]; this.camera.target = [...this.cameraSnapshot.target]; }
    this.cameraSnapshot = null; this.onClose?.(); return this;
  }
  commit() { if (!this.visible) return this; this.transactionSnapshot = null; this.geometryStatus = 'Room changes committed.'; return this.finishClose(); }
  cancel() { if (!this.visible) return this; const snapshot = this.transactionSnapshot; this.transactionSnapshot = null; if (snapshot) this.restoreTransaction(snapshot); return this.finishClose(); }
  close() { return this.commit(); }
  destroy() { if (!this.canvas) return; this.canvas.removeEventListener('pointerdown', this.onCanvasPointerDown); this.canvas.removeEventListener('pointermove', this.onCanvasPointerMove); this.canvas.removeEventListener('pointerup', this.onCanvasPointerUp); this.canvas.removeEventListener('pointercancel', this.onCanvasPointerUp); }
}

export { RoomEditor, floorPoint };
