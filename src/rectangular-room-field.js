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

class RectangularRoomField {
  constructor({ dimensions, speakers = [], frequency = 58, maxFrequency = 200, q = 18, speedOfSound = SPEED_OF_SOUND } = {}) {
    this.dimensions = { ...dimensions };
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
  setFrequency(value) { this.frequency = Number(value); return this.invalidate(); }
  setSpeakers(speakers) { this.speakers = speakers; return this.invalidate(); }

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
      const denominatorImaginary = omegaMode * omega / this.q;
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

export { RectangularRoomField, modalSourceCoupling, modeNormalization, modeShape, SPEED_OF_SOUND };
