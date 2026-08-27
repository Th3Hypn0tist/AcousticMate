import { Complex } from './complex.js';
import { modalSourceCoupling, modeNormalization } from './rectangular-room-field.js';

class SpeakerModeCoupling {
  constructor({ dimensions, crossoverNetwork = null } = {}) {
    if (!dimensions) throw new Error('SpeakerModeCoupling requires room dimensions');
    this.dimensions = { ...dimensions };
    this.crossoverNetwork = crossoverNetwork;
  }

  evaluate(speaker, mode, frequencyHz = mode?.frequency) {
    if (!speaker || !mode) throw new Error('SpeakerModeCoupling requires speaker and mode');
    frequencyHz = Number(frequencyHz);
    const omniSpeaker = Object.create(speaker);
    omniSpeaker.directivityGain = () => 1;
    const normalization = modeNormalization(mode, this.dimensions);
    const spatialRaw = modalSourceCoupling(mode, omniSpeaker, this.dimensions, frequencyHz);
    const directionalRaw = modalSourceCoupling(mode, speaker, this.dimensions, frequencyHz);
    const spatialCoupling = [spatialRaw[0] * normalization, spatialRaw[1] * normalization];
    const directionalCoupling = [directionalRaw[0] * normalization, directionalRaw[1] * normalization];
    let directivityGain;
    if (Math.hypot(...spatialCoupling) > Number.EPSILON) directivityGain = Complex.divide(directionalCoupling, spatialCoupling);
    else directivityGain = directionalCoupling;
    let responseGain = typeof speaker.transferAt === 'function' ? speaker.transferAt(frequencyHz) : [1, 0];
    const crossover = this.crossoverNetwork?.transferFor?.(speaker, frequencyHz) ?? [1, 0];
    responseGain = Complex.multiply(responseGain, crossover);
    return {
      spatialCoupling,
      directivityGain,
      responseGain,
      combinedExcitation: Complex.multiply(directionalCoupling, responseGain),
    };
  }
}

export { SpeakerModeCoupling };
