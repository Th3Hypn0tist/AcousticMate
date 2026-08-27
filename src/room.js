const WALLS = new Set(['x-min', 'x-max', 'z-min', 'z-max']);

function positive(value, name) {
  value = Number(value);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive`);
  return value;
}

function nonNegative(value, name) {
  value = Number(value);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be non-negative`);
  return value;
}

class RoomOpening {
  constructor({ id, wall = 'z-min', offset = 0, width = .9, height = 2.1, sillHeight = 0, type = 'open', transmission = 1 } = {}) {
    if (typeof id !== 'string' || !id) throw new Error('RoomOpening requires a non-empty id');
    if (!WALLS.has(wall)) throw new Error(`Unsupported opening wall: ${wall}`);
    if (type !== 'open') throw new Error('Only open room openings are currently supported');
    this.id = id;
    this.wall = wall;
    this.offset = nonNegative(offset, 'Opening offset');
    this.width = positive(width, 'Opening width');
    this.height = positive(height, 'Opening height');
    this.sillHeight = nonNegative(sillHeight, 'Opening sill height');
    this.type = type;
    this.transmission = Number(transmission);
    if (!Number.isFinite(this.transmission) || this.transmission < 0 || this.transmission > 1) throw new Error('Opening transmission must be between 0 and 1');
  }

  update(values = {}) {
    const next = new RoomOpening({
      id: this.id,
      wall: values.wall ?? this.wall,
      offset: values.offset ?? this.offset,
      width: values.width ?? this.width,
      height: values.height ?? this.height,
      sillHeight: values.sillHeight ?? this.sillHeight,
      type: values.type ?? this.type,
      transmission: values.transmission ?? this.transmission,
    });
    Object.assign(this, next);
    return this;
  }
}

class RectangularRoom {
  constructor({ width = 6, height = 2.7, depth = 4.5, openings = [], acousticObjects = [] } = {}) {
    this.dimensions = { width: positive(width, 'Room width'), height: positive(height, 'Room height'), depth: positive(depth, 'Room depth') };
    this.openings = [];
    this.acousticObjects = [];
    this.listeners = new Map();
    for (const opening of openings) this.addOpening(opening);
    for (const object of acousticObjects) this.addAcousticObject(object);
  }

  on(event, listener) {
    const values = this.listeners.get(event) ?? new Set();
    values.add(listener);
    this.listeners.set(event, values);
    return () => values.delete(listener);
  }

  emit(event, detail = {}) {
    for (const listener of this.listeners.get(event) ?? []) listener({ type: event, target: this, ...detail });
  }

  wallSpan(wall) {
    if (!WALLS.has(wall)) throw new Error(`Unsupported wall: ${wall}`);
    return wall.startsWith('x-') ? this.dimensions.depth : this.dimensions.width;
  }

  validatePatch({ id = 'patch', wall, offset, width, height, sillHeight }) {
    if (!WALLS.has(wall)) throw new Error(`Unsupported wall: ${wall}`);
    const span = this.wallSpan(wall);
    if (Number(offset) < 0 || Number(offset) + Number(width) > span + 1e-9) throw new Error(`${id} exceeds ${wall} wall span`);
    if (Number(sillHeight) < 0 || Number(sillHeight) + Number(height) > this.dimensions.height + 1e-9) throw new Error(`${id} exceeds room height`);
    return true;
  }

  validateOpening(opening) {
    this.validatePatch(opening);
    return opening;
  }

  validateAcousticObject(object) {
    const attachment = object?.attachment;
    if (!attachment) return object;
    this.validatePatch({ id: object.id, ...attachment });
    return object;
  }

  setDimensions(values = {}) {
    const next = {
      width: positive(values.width ?? this.dimensions.width, 'Room width'),
      height: positive(values.height ?? this.dimensions.height, 'Room height'),
      depth: positive(values.depth ?? this.dimensions.depth, 'Room depth'),
    };
    const previous = { ...this.dimensions };
    Object.assign(this.dimensions, next);
    try {
      for (const opening of this.openings) this.validateOpening(opening);
      for (const object of this.acousticObjects) this.validateAcousticObject(object);
    } catch (error) {
      Object.assign(this.dimensions, previous);
      throw error;
    }
    this.emit('geometryChanged', { dimensions: { ...this.dimensions } });
    return this;
  }

  addOpening(value = {}) {
    const opening = value instanceof RoomOpening ? value : new RoomOpening(value);
    if (this.openings.some(item => item.id === opening.id)) throw new Error(`Opening already exists: ${opening.id}`);
    this.validateOpening(opening);
    this.openings.push(opening);
    this.emit('openingAdded', { opening });
    return opening;
  }

  updateOpening(openingOrId, values = {}) {
    const opening = typeof openingOrId === 'string' ? this.openings.find(item => item.id === openingOrId) : openingOrId;
    if (!opening || !this.openings.includes(opening)) throw new Error('Unknown room opening');
    const snapshot = { ...opening };
    opening.update(values);
    try { this.validateOpening(opening); }
    catch (error) { Object.assign(opening, snapshot); throw error; }
    this.emit('openingChanged', { opening });
    return opening;
  }

  removeOpening(openingOrId) {
    const index = this.openings.findIndex(item => item === openingOrId || item.id === openingOrId);
    if (index < 0) return null;
    const [opening] = this.openings.splice(index, 1);
    this.emit('openingRemoved', { opening });
    return opening;
  }

  addAcousticObject(object) {
    if (!object?.id || !object.geometry) throw new Error('Acoustic object requires id and geometry');
    if (this.acousticObjects.some(item => item.id === object.id)) throw new Error(`Acoustic object already exists: ${object.id}`);
    this.validateAcousticObject(object);
    this.acousticObjects.push(object);
    this.emit('acousticObjectAdded', { object });
    return object;
  }

  updateAcousticObject(objectOrId, { attachment = undefined, acousticModel = undefined, materialProfile = undefined } = {}) {
    const object = typeof objectOrId === 'string' ? this.acousticObjects.find(item => item.id === objectOrId) : objectOrId;
    if (!object || !this.acousticObjects.includes(object)) throw new Error('Unknown acoustic object');
    const previousAttachment = object.attachment ? { ...object.attachment } : null;
    if (attachment !== undefined) object.setAttachment(attachment);
    if (acousticModel !== undefined) object.setAcousticModel(acousticModel);
    if (materialProfile !== undefined) object.setMaterialProfile(materialProfile);
    try { this.validateAcousticObject(object); }
    catch (error) { object.setAttachment(previousAttachment); throw error; }
    this.emit('acousticObjectChanged', { object });
    return object;
  }

  removeAcousticObject(objectOrId) {
    const index = this.acousticObjects.findIndex(item => item === objectOrId || item.id === objectOrId);
    if (index < 0) return null;
    const [object] = this.acousticObjects.splice(index, 1);
    this.emit('acousticObjectRemoved', { object });
    return object;
  }

  openingRect(openingOrId) {
    const opening = typeof openingOrId === 'string' ? this.openings.find(item => item.id === openingOrId) : openingOrId;
    if (!opening) throw new Error('Unknown room opening');
    return this.patchRect(opening);
  }

  patchRect(patch) {
    const { width, height, depth } = this.dimensions;
    const y = patch.sillHeight + patch.height / 2;
    if (patch.wall === 'x-min' || patch.wall === 'x-max') {
      return {
        center: [patch.wall === 'x-min' ? 0 : width, y, patch.offset + patch.width / 2],
        size: [0, patch.height, patch.width],
        normal: [patch.wall === 'x-min' ? 1 : -1, 0, 0],
      };
    }
    return {
      center: [patch.offset + patch.width / 2, y, patch.wall === 'z-min' ? 0 : depth],
      size: [patch.width, patch.height, 0],
      normal: [0, 0, patch.wall === 'z-min' ? 1 : -1],
    };
  }

  acousticObjectRect(objectOrId) {
    const object = typeof objectOrId === 'string' ? this.acousticObjects.find(item => item.id === objectOrId) : objectOrId;
    if (!object?.attachment) return null;
    return this.patchRect(object.attachment);
  }
}

export { RectangularRoom, RoomOpening, WALLS };
