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
  constructor({ width = 6, height = 2.7, depth = 4.5, openings = [] } = {}) {
    this.dimensions = { width: positive(width, 'Room width'), height: positive(height, 'Room height'), depth: positive(depth, 'Room depth') };
    this.openings = [];
    this.listeners = new Map();
    for (const opening of openings) this.addOpening(opening);
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
    if (!WALLS.has(wall)) throw new Error(`Unsupported opening wall: ${wall}`);
    return wall.startsWith('x-') ? this.dimensions.depth : this.dimensions.width;
  }

  validateOpening(opening) {
    const span = this.wallSpan(opening.wall);
    if (opening.offset + opening.width > span + 1e-9) throw new Error(`Opening ${opening.id} exceeds ${opening.wall} wall span`);
    if (opening.sillHeight + opening.height > this.dimensions.height + 1e-9) throw new Error(`Opening ${opening.id} exceeds room height`);
    return opening;
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

  openingRect(openingOrId) {
    const opening = typeof openingOrId === 'string' ? this.openings.find(item => item.id === openingOrId) : openingOrId;
    if (!opening) throw new Error('Unknown room opening');
    const { width, height, depth } = this.dimensions;
    const y = opening.sillHeight + opening.height / 2;
    if (opening.wall === 'x-min' || opening.wall === 'x-max') {
      return {
        center: [opening.wall === 'x-min' ? 0 : width, y, opening.offset + opening.width / 2],
        size: [0, opening.height, opening.width],
      };
    }
    return {
      center: [opening.offset + opening.width / 2, y, opening.wall === 'z-min' ? 0 : depth],
      size: [opening.width, opening.height, 0],
    };
  }
}

export { RectangularRoom, RoomOpening, WALLS };
