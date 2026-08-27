import { ConstraintGeometrySolver, ExtrudedVolume, ImageReferenceLayer, Measurement, PolygonEditor } from '../vendor/S3D/s3d.js';

function rectangleVertices({ width, depth }) {
  return [
    { id: 'room-v1', x: 0, z: 0 },
    { id: 'room-v2', x: width, z: 0 },
    { id: 'room-v3', x: width, z: depth },
    { id: 'room-v4', x: 0, z: depth },
  ];
}

class RoomGeometryWorkflow {
  constructor({ room } = {}) {
    if (!room) throw new Error('RoomGeometryWorkflow requires a room');
    this.room = room;
    this.referenceLayer = new ImageReferenceLayer();
    this.polygonEditor = new PolygonEditor({ id: 'room-polygon-editor', vertices: rectangleVertices(room.dimensions), closed: true, y: .01 });
    this.measurements = [];
    this.solver = new ConstraintGeometrySolver();
    this.volume = new ExtrudedVolume({ id: 'room-extruded-volume', polygon: this.polygonEditor, height: room.dimensions.height, baseY: 0 });
    this.lastSolve = null;
    this.listeners = new Map();
    this.syncMeasurementsFromRoom();
    this.room.on('geometryChanged', () => this.syncFromRoom());
    this.polygonEditor.on('geometryChanged', () => this.emit('geometryChanged', { polygon: this.polygonEditor.toPolygon() }));
  }

  on(event, listener) { const set = this.listeners.get(event) ?? new Set(); set.add(listener); this.listeners.set(event, set); return () => set.delete(listener); }
  emit(event, detail = {}) { for (const listener of this.listeners.get(event) ?? []) listener({ type: event, target: this, ...detail }); }

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

  setReferenceImage(image) { this.referenceLayer.setImage(image); this.emit('referenceChanged', { image }); return this; }
  setReferenceOpacity(value) { this.referenceLayer.setOpacity(value); this.emit('referenceChanged', { opacity: this.referenceLayer.opacity }); return this; }

  setMeasurement(id, value, options = {}) {
    const measurement = this.measurements.find(item => item.id === id);
    if (!measurement) throw new Error(`Unknown room measurement: ${id}`);
    const replacement = new Measurement({ ...measurement, ...options, id, anchors: measurement.anchors, value });
    this.measurements.splice(this.measurements.indexOf(measurement), 1, replacement);
    this.emit('measurementsChanged', { measurements: [...this.measurements] });
    return replacement;
  }

  addMeasurement(value) {
    const measurement = value instanceof Measurement ? value : new Measurement(value);
    if (this.measurements.some(item => item.id === measurement.id)) throw new Error(`Measurement already exists: ${measurement.id}`);
    this.measurements.push(measurement);
    this.emit('measurementsChanged', { measurements: [...this.measurements] });
    return measurement;
  }

  removeMeasurement(id) {
    const index = this.measurements.findIndex(item => item.id === id);
    if (index < 0) return null;
    const [measurement] = this.measurements.splice(index, 1);
    this.emit('measurementsChanged', { measurements: [...this.measurements] });
    return measurement;
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
