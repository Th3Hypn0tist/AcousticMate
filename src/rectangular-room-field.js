const SPEED_OF_SOUND = 343;

function modeShape(mode, point, dimensions) {
  return Math.cos(mode.nx * Math.PI * point[0] / dimensions.width)
    * Math.cos(mode.ny * Math.PI * point[1] / dimensions.height)
    * Math.cos(mode.nz * Math.PI * point[2] / dimensions.depth);
}

function modeNormalization(mode, dimensions) {
  const volume = dimensions.width * dimensions.height * dimensions.depth;
  const multiplicity = (mode.nx ? 2 : 1) * (mode.ny ? 2 : 1) * (mode.nz ? 2 : 1);
  return multiplicity / volume;
}

function modalSourceCoupling(mode, speaker, dimensions, frequencyHz) {
  const k = [
    mode.nx * Math.PI / dimensions.width,
    mode.ny * Math.PI / dimensions.height,
    mode.nz * Math.PI / dimensions.depth,
  ];
  const activeAxes = k.map((value, index) => value ? index : -1).filter(index => index >= 0);
  if (!activeAxes.length) return [1, 0];
  const componentCount = 2 ** activeAxes.length;
  let real = 0;
  let imaginary = 0;
  for (let mask = 0; mask < componentCount; mask++) {
    const direction = [...k];
    let phase = 0;
    for (let bit = 0; bit < activeAxes.length; bit++) {
      const axis = activeAxes[bit];
      const sign = mask & (1 << bit) ? 1 : -1;
      direction[axis] *= sign;
      phase += direction[axis] * speaker.position[axis];
    }
    const gain = typeof speaker.directivityGain === 'function' ? speaker.directivityGain(frequencyHz, direction) : 1;
    real += gain * Math.cos(phase);
    imaginary += gain * Math.sin(phase);
  }
  return [real / componentCount, imaginary / componentCount];
}

function boundaryPoint(patch, u, v, dimensions) {
  const along = patch.offset + patch.width * u;
  const y = patch.sillHeight + patch.height * v;
  if (patch.wall === 'x-min') return [0, y, along];
  if (patch.wall === 'x-max') return [dimensions.width, y, along];
  if (patch.wall === 'z-min') return [along, y, 0];
  if (patch.wall === 'z-max') return [along, y, dimensions.depth];
  throw new Error(`Unsupported boundary wall: ${patch.wall}`);
}

function boundaryModeEffectiveArea(mode, patch, dimensions, coefficient = 1, grid = 4) {
  if (!patch) return 0;
  const count = Math.max(1, Math.floor(Number(grid) || 1));
  let sum = 0;
  for (let iv = 0; iv < count; iv++) for (let iu = 0; iu < count; iu++) {
    const point = boundaryPoint(patch, (iu + .5) / count, (iv + .5) / count, dimensions);
    const value = modeShape(mode, point, dimensions);
    sum += value * value;
  }
  const meanBoundarySquared = sum / (count * count);
  const multiplicity = (mode.nx ? 2 : 1) * (mode.ny ? 2 : 1) * (mode.nz ? 2 : 1);
  const normalizedBoundaryIntensity = multiplicity * meanBoundarySquared;
  const area = Number(patch.width) * Number(patch.height);
  return area * Math.max(0, Math.min(1, Number(coefficient) || 0)) * normalizedBoundaryIntensity;
}

function openingModeEffectiveArea(mode, opening, dimensions, grid = 4) {
  if (opening?.type !== 'open') return 0;
  return boundaryModeEffectiveArea(mode, opening, dimensions, opening.transmission ?? 1, grid);
}

function openingInverseQ(mode, openings, dimensions, speedOfSound = SPEED_OF_SOUND) {
  if (!openings?.length || mode.frequency <= 0) return 0;
  const volume = dimensions.width * dimensions.height * dimensions.depth;
  const omegaMode = 2 * Math.PI * mode.frequency;
  const effectiveArea = openings.reduce((total, opening) => total + openingModeEffectiveArea(mode, opening, dimensions), 0);
  return speedOfSound * effectiveArea / (4 * omegaMode * volume);
}

function acousticObjectInverseQ(mode, acousticObjects, dimensions, speedOfSound = SPEED_OF_SOUND) {
  if (!acousticObjects?.length || mode.frequency <= 0) return 0;
  const volume = dimensions.width * dimensions.height * dimensions.depth;
  const omegaMode = 2 * Math.PI * mode.frequency;
  let effectiveArea = 0;
  for (const object of acousticObjects) {
    if (!object?.attachment) continue;
    const absorption = typeof object.absorptionAt === 'function' ? object.absorptionAt(mode.frequency) : 0;
    if (absorption <= 0) continue;
    effectiveArea += boundaryModeEffectiveArea(mode, object.attachment, dimensions, absorption);
  }
  return speedOfSound * effectiveArea / (4 * omegaMode * volume);
}

class RectangularRoomField {
  constructor({ dimensions, openings = [], acousticObjects = [], speakers = [], frequency = 58, maxFrequency = 200, q = 18, speedOfSound = SPEED_OF_SOUND } = {}) {
    this.dimensions = { ...dimensions };
    this.openings = [...openings];
    this.acousticObjects = [...acousticObjects];
    this.speakers = speakers;
    this.frequency = Number(frequency);
    this.maxFrequency = Number(maxFrequency);
    this.q = Number(q);
    this.speedOfSound = Number(speedOfSound);
    this.modes = this.buildModes();
    this.preparedModes = null;
  }

  buildModes() {
    const { width, height, depth } = this.dimensions;
    if (![width, height, depth].every(value => Number.isFinite(value) && value > 0)) throw new Error('Room dimensions must be positive');
    if (!Number.isFinite(this.maxFrequency) || this.maxFrequency <= 0) throw new Error('maxFrequency must be positive');
    const limits = [width, height, depth].map(length => Math.ceil(this.maxFrequency * 2 * length / this.speedOfSound));
    const modes = [];
    for (let nx = 0; nx <= limits[0]; nx++) for (let ny = 0; ny <= limits[1]; ny++) for (let nz = 0; nz <= limits[2]; nz++) {
      if (nx === 0 && ny === 0 && nz === 0) continue;
      const frequency = this.speedOfSound * .5 * Math.sqrt((nx / width) ** 2 + (ny / height) ** 2 + (nz / depth) ** 2);
      if (frequency <= this.maxFrequency) modes.push({ nx, ny, nz, frequency });
    }
    return modes.sort((a, b) => a.frequency - b.frequency);
  }

  invalidate() { this.preparedModes = null; return this; }
  rebuildModes() { this.modes = this.buildModes(); return this.invalidate(); }
  setFrequency(value) { this.frequency = Number(value); return this.invalidate(); }
  setSpeakers(speakers) { this.speakers = speakers; return this.invalidate(); }
  setOpenings(openings = []) { this.openings = [...openings]; return this.invalidate(); }
  setAcousticObjects(acousticObjects = []) { this.acousticObjects = [...acousticObjects]; return this.invalidate(); }
  setDimensions(dimensions) { this.dimensions = { ...dimensions }; return this.rebuildModes(); }
  setRoom(room) {
    this.dimensions = { ...room.dimensions };
    this.openings = [...room.openings];
    this.acousticObjects = [...(room.acousticObjects ?? [])];
    return this.rebuildModes();
  }

  speakerTransfer(speaker) {
    if (typeof speaker.transferAt === 'function') return speaker.transferAt(this.frequency);
    const gain = 10 ** (Number(speaker.gainDb ?? 0) / 20);
    const polarity = speaker.polarityInverted ? Math.PI : 0;
    const delay = -2 * Math.PI * this.frequency * Number(speaker.delayMs ?? 0) / 1000;
    const phase = polarity + delay;
    return [gain * Math.cos(phase), gain * Math.sin(phase)];
  }

  prepareModes() {
    if (this.preparedModes) return this.preparedModes;
    const omega = 2 * Math.PI * this.frequency;
    const speakers = this.speakers
      .filter(speaker => typeof speaker.isAcousticallyEnabled === 'function' ? speaker.isAcousticallyEnabled() : speaker.enabled !== false)
      .map(speaker => ({ speaker, transfer: this.speakerTransfer(speaker) }));
    this.preparedModes = this.modes.map(mode => {
      const omegaMode = 2 * Math.PI * mode.frequency;
      const denominatorReal = omegaMode * omegaMode - omega * omega;
      const baseInverseQ = 1 / this.q;
      const leakInverseQ = openingInverseQ(mode, this.openings, this.dimensions, this.speedOfSound);
      const treatmentInverseQ = acousticObjectInverseQ(mode, this.acousticObjects, this.dimensions, this.speedOfSound);
      const effectiveInverseQ = baseInverseQ + leakInverseQ + treatmentInverseQ;
      const denominatorImaginary = omegaMode * omega * effectiveInverseQ;
      const denominatorMagnitude = denominatorReal ** 2 + denominatorImaginary ** 2 || 1;
      const roomReal = denominatorReal / denominatorMagnitude;
      const roomImaginary = -denominatorImaginary / denominatorMagnitude;
      let sourceReal = 0;
      let sourceImaginary = 0;
      const normalization = modeNormalization(mode, this.dimensions);
      for (const { speaker, transfer } of speakers) {
        const [couplingRealRaw, couplingImaginaryRaw] = modalSourceCoupling(mode, speaker, this.dimensions, this.frequency);
        const couplingReal = couplingRealRaw * normalization;
        const couplingImaginary = couplingImaginaryRaw * normalization;
        sourceReal += couplingReal * transfer[0] - couplingImaginary * transfer[1];
        sourceImaginary += couplingReal * transfer[1] + couplingImaginary * transfer[0];
      }
      return {
        mode,
        inverseQ: effectiveInverseQ,
        openingInverseQ: leakInverseQ,
        treatmentInverseQ,
        real: sourceReal * roomReal - sourceImaginary * roomImaginary,
        imaginary: sourceReal * roomImaginary + sourceImaginary * roomReal,
      };
    });
    return this.preparedModes;
  }

  sampleComplex(x, y, z) {
    const point = [x, y, z];
    let real = 0;
    let imaginary = 0;
    for (const prepared of this.prepareModes()) {
      const { mode } = prepared;
      const atPoint = modeShape(mode, point, this.dimensions);
      real += atPoint * prepared.real;
      imaginary += atPoint * prepared.imaginary;
    }
    return [real, imaginary];
  }

  sample(x, y, z) {
    const [real, imaginary] = this.sampleComplex(x, y, z);
    return Math.hypot(real, imaginary);
  }
}

export {
  RectangularRoomField,
  modalSourceCoupling,
  modeNormalization,
  modeShape,
  boundaryModeEffectiveArea,
  openingModeEffectiveArea,
  openingInverseQ,
  acousticObjectInverseQ,
  SPEED_OF_SOUND,
};
