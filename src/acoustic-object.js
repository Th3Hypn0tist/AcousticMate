const BOUNDARY_MODELS = new Set(['rigid', 'absorptive', 'scattering', 'impedance']);
const OBJECT_TYPES = new Set(['absorber', 'diffuser', 'bass-trap', 'custom']);

function finite(value, name) {
  value = Number(value);
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
  return value;
}

function rotation3(value, name = 'Presentation rotation') {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${name} must be [x,y,z]`);
  return value.map((item, index) => finite(item, `${name}[${index}]`));
}

function profilePoints(value, name) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value.map(point => {
    if (!Array.isArray(point) || point.length !== 2) throw new Error(`${name} points must be [Hz,value]`);
    const hz = finite(point[0], `${name} frequency`);
    const amount = finite(point[1], `${name} value`);
    if (hz <= 0 || amount < 0 || amount > 1) throw new Error(`${name} values require Hz > 0 and value in 0..1`);
    return [hz, amount];
  }).sort((a, b) => a[0] - b[0]);
}

function interpolate(points, frequencyHz, fallback = 0) {
  if (!points.length) return fallback;
  const f = Number(frequencyHz);
  if (f <= points[0][0]) return points[0][1];
  if (f >= points.at(-1)[0]) return points.at(-1)[1];
  const upper = points.findIndex(point => point[0] >= f);
  const a = points[upper - 1];
  const b = points[upper];
  const t = (f - a[0]) / (b[0] - a[0]);
  return a[1] + (b[1] - a[1]) * t;
}

class AcousticMaterialProfile {
  constructor({ absorption = [], scattering = [], normalizedConductance = [] } = {}) {
    this.absorption = profilePoints(absorption, 'Absorption profile');
    this.scattering = profilePoints(scattering, 'Scattering profile');
    this.normalizedConductance = profilePoints(normalizedConductance, 'Normalized conductance profile');
  }
  absorptionAt(frequencyHz) { return interpolate(this.absorption, frequencyHz, 0); }
  scatteringAt(frequencyHz) { return interpolate(this.scattering, frequencyHz, 0); }
  normalizedConductanceAt(frequencyHz) { return interpolate(this.normalizedConductance, frequencyHz, 0); }
}

class AcousticObject {
  constructor({ id, type = 'custom', geometry, acousticModel = 'rigid', materialProfile = null, attachment = null, metadata = {} } = {}) {
    if (typeof id !== 'string' || !id) throw new Error('AcousticObject requires a non-empty id');
    if (!OBJECT_TYPES.has(type)) throw new Error(`Unsupported AcousticObject type: ${type}`);
    if (!geometry || typeof geometry.draw !== 'function') throw new Error('AcousticObject geometry must be an S3D Primitive instance');
    if (!BOUNDARY_MODELS.has(acousticModel)) throw new Error(`Unsupported acoustic boundary model: ${acousticModel}`);
    this.id = id;
    this.type = type;
    this.geometry = geometry;
    this.acousticModel = acousticModel;
    this.materialProfile = materialProfile instanceof AcousticMaterialProfile ? materialProfile : new AcousticMaterialProfile(materialProfile ?? {});
    this.attachment = attachment ? { ...attachment } : null;
    this.metadata = { ...metadata };
    this.listeners = new Map();
    this.room = null;
    this.geometry.acousticObject = this;
    this.syncPresentationGeometry();
  }

  on(event, listener) {
    const values = this.listeners.get(event) ?? new Set();
    values.add(listener);
    this.listeners.set(event, values);
    return () => values.delete(listener);
  }
  emit(event, detail = {}) { for (const listener of this.listeners.get(event) ?? []) listener({ type: event, target: this, ...detail }); }
  setAttachment(value) { this.attachment = value ? { ...value } : null; this.emit('changed'); return this; }
  setAcousticModel(value) {
    if (!BOUNDARY_MODELS.has(value)) throw new Error(`Unsupported acoustic boundary model: ${value}`);
    this.acousticModel = value;
    this.emit('changed');
    return this;
  }
  setMaterialProfile(value) { this.materialProfile = value instanceof AcousticMaterialProfile ? value : new AcousticMaterialProfile(value ?? {}); this.emit('changed'); return this; }
  setPresentationRotation(value, { emit = true } = {}) {
    const rotation = rotation3(value);
    this.metadata.presentationRotation = [...rotation];
    this.geometry.setRotation?.(rotation, { emit: false });
    if (emit) this.emit('changed', { presentationRotation: [...rotation] });
    return this;
  }
  syncPresentationGeometry() {
    const rotation = this.metadata?.presentationRotation == null ? [0, 0, 0] : rotation3(this.metadata.presentationRotation);
    this.geometry.setRotation?.(rotation, { emit: false });
    return this;
  }
  absorptionAt(frequencyHz) { return this.acousticModel === 'absorptive' || this.acousticModel === 'impedance' ? this.materialProfile.absorptionAt(frequencyHz) : 0; }
  scatteringAt(frequencyHz) { return this.acousticModel === 'scattering' ? this.materialProfile.scatteringAt(frequencyHz) : 0; }
  normalizedConductanceAt(frequencyHz) { return this.acousticModel === 'impedance' ? this.materialProfile.normalizedConductanceAt(frequencyHz) : 0; }
}

export { AcousticObject, AcousticMaterialProfile, BOUNDARY_MODELS, OBJECT_TYPES, rotation3 };
