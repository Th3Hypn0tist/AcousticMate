import { Complex } from './complex.js';

const TAU = 2 * Math.PI;

function uniqueEnabledSpeakers(speakers = [], speakerSets = []) {
  const values = [];
  const seen = new Set();
  const add = speaker => {
    if (!speaker || seen.has(speaker)) return;
    seen.add(speaker);
    const enabled = typeof speaker.isAcousticallyEnabled === 'function' ? speaker.isAcousticallyEnabled() : speaker.enabled !== false;
    if (enabled) values.push(speaker);
  };
  for (const speaker of speakers) add(speaker);
  for (const set of speakerSets) for (const member of set?.members ?? []) add(member?.speaker);
  return values;
}

class DirectSoundField {
  constructor({ speakers = [], speakerSets = [], crossoverNetwork = null, speedOfSound = 343, minimumDistance = .1 } = {}) {
    this.speakers = speakers;
    this.speakerSets = speakerSets;
    this.crossoverNetwork = crossoverNetwork;
    this.speedOfSound = Number(speedOfSound);
    this.minimumDistance = Number(minimumDistance);
    if (!Number.isFinite(this.speedOfSound) || this.speedOfSound <= 0) throw new Error('DirectSoundField speedOfSound must be positive');
    if (!Number.isFinite(this.minimumDistance) || this.minimumDistance <= 0) throw new Error('DirectSoundField minimumDistance must be positive');
    this.range = [0, Infinity];
    this.frequency = null;
    this.frequencyRange = null;
    this.preparedSourceCache = new Map();
  }

  invalidate() {
    this.preparedSourceCache.clear();
    return this;
  }

  setSpeakers(speakers = [], speakerSets = this.speakerSets) {
    this.speakers = speakers;
    this.speakerSets = speakerSets;
    return this.invalidate();
  }

  speakerTransfer(speaker, frequencyHz) {
    const local = typeof speaker.transferAt === 'function' ? speaker.transferAt(frequencyHz) : [1, 0];
    const routed = this.crossoverNetwork?.transferFor?.(speaker, frequencyHz) ?? [1, 0];
    return Complex.multiply(local, routed);
  }

  prepareSourcesAt(frequencyHz) {
    frequencyHz = Number(frequencyHz);
    if (!Number.isFinite(frequencyHz) || frequencyHz < 0) throw new Error('DirectSoundField frequency must be non-negative');
    const cached = this.preparedSourceCache.get(frequencyHz);
    if (cached) return cached;
    const waveNumber = TAU * frequencyHz / this.speedOfSound;
    const prepared = uniqueEnabledSpeakers(this.speakers, this.speakerSets).map(speaker => ({
      speaker,
      transfer: this.speakerTransfer(speaker, frequencyHz),
      waveNumber,
    }));
    this.preparedSourceCache.set(frequencyHz, prepared);
    return prepared;
  }

  contributionFor(preparedSource, point, frequencyHz) {
    const { speaker, transfer, waveNumber } = preparedSource;
    const offset = [
      point[0] - speaker.position[0],
      point[1] - speaker.position[1],
      point[2] - speaker.position[2],
    ];
    const physicalDistance = Math.hypot(...offset);
    const distance = Math.max(this.minimumDistance, physicalDistance);
    const directivity = typeof speaker.directivityGain === 'function'
      ? Math.max(0, Number(speaker.directivityGain(frequencyHz, offset)) || 0)
      : 1;
    if (directivity <= 0) return [0, 0];
    const propagation = Complex.fromPolar(directivity / (4 * Math.PI * distance), -waveNumber * physicalDistance);
    return Complex.multiply(transfer, propagation);
  }

  sampleComplexAtFrequency(x, y, z, frequencyHz) {
    frequencyHz = Number(frequencyHz);
    if (!Number.isFinite(frequencyHz) || frequencyHz < 0) throw new Error('DirectSoundField frequency must be non-negative');
    const point = [Number(x), Number(y), Number(z)];
    if (!point.every(Number.isFinite)) throw new Error('DirectSoundField sample position must be finite');
    let sum = [0, 0];
    for (const preparedSource of this.prepareSourcesAt(frequencyHz)) {
      sum = Complex.add(sum, this.contributionFor(preparedSource, point, frequencyHz));
    }
    return sum;
  }

  sampleAtFrequency(x, y, z, frequencyHz) {
    return Complex.magnitude(this.sampleComplexAtFrequency(x, y, z, frequencyHz));
  }

  sampleComplex(x, y, z, frequencyHz = this.frequency) {
    if (frequencyHz == null) throw new Error('DirectSoundField sampleComplex requires a frequency');
    return this.sampleComplexAtFrequency(x, y, z, frequencyHz);
  }

  sample(x, y, z, frequencyHz = this.frequency) {
    if (frequencyHz == null) throw new Error('DirectSoundField sample requires a frequency');
    return this.sampleAtFrequency(x, y, z, frequencyHz);
  }
}

export { DirectSoundField, uniqueEnabledSpeakers };
