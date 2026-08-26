const SPEED_OF_SOUND = 343;

function modeShape(mode, point, dimensions) {
  return Math.cos(mode.nx * Math.PI * point[0] / dimensions.width)
    * Math.cos(mode.ny * Math.PI * point[1] / dimensions.height)
    * Math.cos(mode.nz * Math.PI * point[2] / dimensions.depth);
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
  }

  buildModes() {
    const { width, height, depth } = this.dimensions;
    if (![width, height, depth].every(value => Number.isFinite(value) && value > 0)) throw new Error('Room dimensions must be positive');
    const limits = [width, height, depth].map(length => Math.ceil(this.maxFrequency * 2 * length / this.speedOfSound));
    const modes = [];
    for (let nx = 0; nx <= limits[0]; nx++) for (let ny = 0; ny <= limits[1]; ny++) for (let nz = 0; nz <= limits[2]; nz++) {
      if (nx === 0 && ny === 0 && nz === 0) continue;
      const frequency = this.speedOfSound * .5 * Math.sqrt((nx / width) ** 2 + (ny / height) ** 2 + (nz / depth) ** 2);
      if (frequency <= this.maxFrequency) modes.push({ nx, ny, nz, frequency });
    }
    return modes.sort((a, b) => a.frequency - b.frequency);
  }

  setFrequency(value) { this.frequency = Number(value); return this; }
  setSpeakers(speakers) { this.speakers = speakers; return this; }

  speakerTransfer(speaker) {
    const gain = 10 ** (Number(speaker.gainDb ?? 0) / 20);
    const polarity = speaker.polarityInverted ? Math.PI : 0;
    const delay = -2 * Math.PI * this.frequency * Number(speaker.delayMs ?? 0) / 1000;
    const phase = polarity + delay;
    return [gain * Math.cos(phase), gain * Math.sin(phase)];
  }

  sampleComplex(x, y, z) {
    const point = [x, y, z];
    const omega = 2 * Math.PI * this.frequency;
    let real = 0;
    let imaginary = 0;
    for (const mode of this.modes) {
      const omegaMode = 2 * Math.PI * mode.frequency;
      const denominatorReal = omegaMode * omegaMode - omega * omega;
      const denominatorImaginary = omegaMode * omega / this.q;
      const denominatorMagnitude = denominatorReal ** 2 + denominatorImaginary ** 2 || 1;
      const roomReal = denominatorReal / denominatorMagnitude;
      const roomImaginary = -denominatorImaginary / denominatorMagnitude;
      const atPoint = modeShape(mode, point, this.dimensions);
      for (const speaker of this.speakers) {
        if (speaker.enabled === false) continue;
        const atSource = modeShape(mode, speaker.position, this.dimensions);
        const coupling = atPoint * atSource;
        const [sourceReal, sourceImaginary] = this.speakerTransfer(speaker);
        real += coupling * (sourceReal * roomReal - sourceImaginary * roomImaginary);
        imaginary += coupling * (sourceReal * roomImaginary + sourceImaginary * roomReal);
      }
    }
    return [real, imaginary];
  }

  sample(x, y, z) {
    const [real, imaginary] = this.sampleComplex(x, y, z);
    return Math.hypot(real, imaginary);
  }
}

export { RectangularRoomField, modeShape, SPEED_OF_SOUND };
