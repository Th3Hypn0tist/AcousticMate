import { ConstraintGeometrySolver, ExtrudedVolume, ImageReferenceLayer, Measurement, PolygonEditor, resolveAnchor } from '../vendor/S3D/s3d.js';

function rectangleVertices({ width, depth }) {
  return [
    { id: 'room-v1', x: 0, z: 0 },
    { id: 'room-v2', x: width, z: 0 },
    { id: 'room-v3', x: width, z: depth },
    { id: 'room-v4', x: 0, z: depth },
  ];
}

function distance(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

class RoomGeometryWorkflow {
  constructor({ room } = {}) {
    if (!room) throw new Error('RoomGeometryWorkflow requires a room');
    this.room = room;
    this.referenceLayer = new ImageReferenceLayer({ id: 'room-reference-layer', y: .002, opacity: .45 });
    this.referenceName = null;
    this.polygonEditor = new PolygonEditor({ id: 'room-polygon-editor', vertices: rectangleVertices(room.dimensions), closed: true, y: .01 });
    this.measurements = [];
    this.solver = new ConstraintGeometrySolver();
    this.volume = new ExtrudedVolume({ id: 'room-extruded-volume', polygon: this.polygonEditor, height: room.dimensions.height, baseY: 0 });
    this.lastSolve = null;
    this.listeners = new Map();
    const polygonDraw = this.polygonEditor.draw.bind(this.polygonEditor);
    this.polygonEditor.draw = (renderer, context = {}) => {
      this.referenceLayer.draw(renderer, context);
      polygonDraw(renderer, context);
    };
    this.syncMeasurementsFromRoom();
    this.room.on('geometryChanged', () => this.syncFromRoom());
    this.polygonEditor.on('geometryChanged', () => {
      this.syncVolumeFromPolygon();
      this.emit('geometryChanged', { polygon: this.polygonEditor.toPolygon() });
    });
  }

  on(event, listener) { const set = this.listeners.get(event) ?? new Set(); set.add(listener); this.listeners.set(event, set); return () => set.delete(listener); }
  emit(event, detail = {}) { for (const listener of this.listeners.get(event) ?? []) listener({ type: event, target: this, ...detail }); }

  syncVolumeFromPolygon() {
    const polygon = this.polygonEditor.toPolygon();
    if (polygon.closed && polygon.vertices.length >= 3) this.volume.setPolygon(this.polygonEditor).setHeight(this.room.dimensions.height);
    return this;
  }
  syncVolume() { return this.syncVolumeFromPolygon(); }

  syncMeasurementsFromRoom() {
    const { width, depth } = this.room.dimensions;
    this.measurements = [
      new Measurement({ id: 'room-width-front', anchors: [{ type: 'vertex', target: 'room-v1' }, { type: 'vertex', target: 'room-v2' }], value: width, source: 'measured', confidence: 1 }),
      new Measurement({ id: 'room-depth-right', anchors: [{ type: 'vertex', target: 'room-v2' }, { type: 'vertex', target: 'room-v3' }], value: depth, source: 'measured', confidence: 1 }),
    ];
    return this;
  }

  syncFromRoom() {
    const vertices = rectangleVertices(this.room.dimensions);
    this.polygonEditor.restore({ vertices, closed: true, selection: [] });
    this.volume.setPolygon(this.polygonEditor).setHeight(this.room.dimensions.height);
    this.syncMeasurementsFromRoom();
    this.emit('synced', { polygon: this.polygonEditor.toPolygon(), volume: this.volume.volume });
    return this;
  }

  fitReference(width, height) {
    width = Number(width);
    height = Number(height);
    if (!(width > 0 && height > 0)) return this;
    this.referenceLayer.setTransform({ position: [0, 0], rotation: 0, scale: [this.room.dimensions.width / width, this.room.dimensions.depth / height] });
    this.emit('referenceChanged', { transform: this.referenceTransform(), fitted: true });
    return this;
  }

  referenceTransform() { return { position: [...this.referenceLayer.position2D], rotation: this.referenceLayer.rotation, scale: [...this.referenceLayer.scaleValue] }; }
  setReferenceTransform({ position, rotation, scale } = {}) {
    const current = this.referenceTransform();
    this.referenceLayer.setTransform({ position: position ?? current.position, rotation: rotation ?? current.rotation, scale: scale ?? current.scale });
    this.emit('referenceChanged', { transform: this.referenceTransform() });
    return this;
  }
  setReferencePosition(x, z) { return this.setReferenceTransform({ position: [Number(x), Number(z)] }); }
  setReferenceRotation(value) { return this.setReferenceTransform({ rotation: Number(value) }); }
  setReferenceScale(x, z = x) { return this.setReferenceTransform({ scale: [Number(x), Number(z)] }); }

  setReferenceImage(image) {
    this.referenceName = typeof image?.name === 'string' ? image.name : this.referenceName;
    this.referenceLayer.setImage(image);
    const width = Number(image?.naturalWidth ?? image?.width ?? 0);
    const height = Number(image?.naturalHeight ?? image?.height ?? 0);
    if (width > 0 && height > 0) this.fitReference(width, height);
    else if (typeof Blob !== 'undefined' && image instanceof Blob && typeof createImageBitmap === 'function') {
      createImageBitmap(image).then(bitmap => {
        this.referenceLayer.setImage(bitmap);
        this.fitReference(bitmap.width, bitmap.height);
        this.emit('referenceChanged', { image: bitmap, name: this.referenceName, fitted: true });
      }).catch(error => this.emit('referenceError', { error }));
    }
    this.emit('referenceChanged', { image, name: this.referenceName });
    return this;
  }
  setReferenceOpacity(value) { this.referenceLayer.setOpacity(value); this.emit('referenceChanged', { opacity: this.referenceLayer.opacity }); return this; }

  addVertex(value, index = this.polygonEditor.vertices.length) {
    const vertex = this.polygonEditor.addVertex(value, index);
    this.emit('topologyChanged', { operation: 'add', vertex, polygon: this.polygonEditor.toPolygon() });
    return vertex;
  }
  insertVertex(afterVertexOrId, value) {
    const vertex = this.polygonEditor.insertVertex(afterVertexOrId, value);
    this.emit('topologyChanged', { operation: 'insert', vertex, polygon: this.polygonEditor.toPolygon() });
    return vertex;
  }
  insertVertexAfter(afterVertexOrId, value) { return this.insertVertex(afterVertexOrId, value); }
  removeVertex(vertexOrId) {
    const vertex = this.polygonEditor.removeVertex(vertexOrId);
    this.pruneInvalidMeasurements();
    this.emit('topologyChanged', { operation: 'remove', vertex, polygon: this.polygonEditor.toPolygon() });
    return vertex;
  }
  undo() {
    const changed = this.polygonEditor.undo();
    if (changed) { this.pruneInvalidMeasurements(); this.syncVolumeFromPolygon(); this.emit('historyChanged', { operation: 'undo', polygon: this.polygonEditor.toPolygon() }); }
    return changed;
  }
  redo() {
    const changed = this.polygonEditor.redo();
    if (changed) { this.pruneInvalidMeasurements(); this.syncVolumeFromPolygon(); this.emit('historyChanged', { operation: 'redo', polygon: this.polygonEditor.toPolygon() }); }
    return changed;
  }

  vertexAnchor(vertexOrId) { const vertex = this.polygonEditor.vertex(vertexOrId); return { type: 'vertex', target: vertex.id }; }
  edgeAnchor(edgeOrId, t = .5) {
    const edge = typeof edgeOrId === 'string' ? this.polygonEditor.edges().find(item => item.id === edgeOrId) : edgeOrId;
    if (!edge || !this.polygonEditor.edges().some(item => item.id === edge.id)) throw new Error('Unknown polygon edge');
    t = Number(t); if (!Number.isFinite(t)) throw new Error('Edge anchor t must be finite');
    return { type: 'edge', target: edge.id, t: Math.max(0, Math.min(1, t)) };
  }
  freeAnchor(position) { if (!Array.isArray(position) || position.length !== 2 || !position.every(Number.isFinite)) throw new Error('Free anchor requires [x,z]'); return { type: 'free', position: [...position] }; }

  measurement(id) { const measurement = this.measurements.find(item => item.id === id); if (!measurement) throw new Error(`Unknown room measurement: ${id}`); return measurement; }
  replaceMeasurement(id, options = {}) {
    const measurement = this.measurement(id);
    const replacement = new Measurement({ id, anchors: options.anchors ?? measurement.anchors, value: options.value ?? measurement.value, source: options.source ?? measurement.source, confidence: options.confidence ?? measurement.confidence, unit: measurement.unit });
    this.measurements.splice(this.measurements.indexOf(measurement), 1, replacement);
    this.emit('measurementsChanged', { measurements: [...this.measurements] });
    return replacement;
  }
  setMeasurement(id, value, options = {}) { return this.replaceMeasurement(id, { ...options, value }); }
  setMeasurementAnchors(id, anchors, { preserveValue = false } = {}) {
    if (!Array.isArray(anchors) || anchors.length !== 2) throw new Error('Measurement requires exactly two anchors');
    const current = this.measurement(id);
    const polygon = this.polygonEditor.toPolygon();
    const actual = distance(resolveAnchor(anchors[0], polygon), resolveAnchor(anchors[1], polygon));
    return this.replaceMeasurement(id, { anchors, value: preserveValue ? current.value : actual, source: preserveValue ? current.source : 'drawing', confidence: preserveValue ? current.confidence : .5 });
  }

  addMeasurement(value) {
    const measurement = value instanceof Measurement ? value : new Measurement(value);
    const existingIndex = this.measurements.findIndex(item => item.id === measurement.id);
    if (existingIndex >= 0) this.measurements.splice(existingIndex, 1, measurement);
    else this.measurements.push(measurement);
    this.emit('measurementsChanged', { measurements: [...this.measurements] });
    return measurement;
  }
  addMeasurementFromAnchors({ id, anchors, source = 'drawing', confidence = .5, value = null } = {}) {
    if (!Array.isArray(anchors) || anchors.length !== 2) throw new Error('Measurement requires exactly two anchors');
    const polygon = this.polygonEditor.toPolygon();
    const actual = distance(resolveAnchor(anchors[0], polygon), resolveAnchor(anchors[1], polygon));
    return this.addMeasurement(new Measurement({ id, anchors, value: value ?? actual, source, confidence }));
  }
  removeMeasurement(id) { const index = this.measurements.findIndex(item => item.id === id); if (index < 0) return null; const [measurement] = this.measurements.splice(index, 1); this.emit('measurementsChanged', { measurements: [...this.measurements] }); return measurement; }
  pruneInvalidMeasurements() {
    const polygon = this.polygonEditor.toPolygon();
    const before = this.measurements.length;
    this.measurements = this.measurements.filter(measurement => { try { resolveAnchor(measurement.anchors[0], polygon); resolveAnchor(measurement.anchors[1], polygon); return true; } catch { return false; } });
    if (this.measurements.length !== before) this.emit('measurementsChanged', { measurements: [...this.measurements] });
    return this;
  }

  solve() {
    this.lastSolve = this.solver.solve(this.polygonEditor, this.measurements);
    this.polygonEditor.restore({ vertices: this.lastSolve.polygon.vertices, closed: this.lastSolve.polygon.closed, selection: [] });
    this.volume.setPolygon(this.polygonEditor).setHeight(this.room.dimensions.height);
    this.emit('solved', this.lastSolve);
    return this.lastSolve;
  }
  isAxisAlignedRectangle(polygon = this.polygonEditor.toPolygon(), tolerance = 1e-4) {
    const vertices = polygon.vertices;
    if (!polygon.closed || vertices.length !== 4) return false;
    const xs = [...new Set(vertices.map(vertex => Math.round(vertex.x / tolerance) * tolerance))];
    const zs = [...new Set(vertices.map(vertex => Math.round(vertex.z / tolerance) * tolerance))];
    return xs.length === 2 && zs.length === 2;
  }
  commitRectangularRoom() {
    const polygon = this.polygonEditor.toPolygon();
    if (!this.isAxisAlignedRectangle(polygon)) throw new Error('Current analytical room solver only accepts an axis-aligned rectangular polygon');
    const xs = polygon.vertices.map(vertex => vertex.x), zs = polygon.vertices.map(vertex => vertex.z);
    const width = Math.max(...xs) - Math.min(...xs), depth = Math.max(...zs) - Math.min(...zs);
    this.room.setDimensions({ width, depth, height: this.volume.height });
    return this.room;
  }
}

export { RoomGeometryWorkflow, rectangleVertices };
