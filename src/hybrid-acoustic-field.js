import { Complex } from './complex.js';

function clamp01(value) { return Math.min(1, Math.max(0, Number(value) || 0)); }
function smoothstep(value) { const t = clamp01(value); return t * t * (3 - 2 * t); }

function logarithmicTransitionWeight(frequencyHz, startHz = 20, endHz = 500, minimumDirectWeight = .22) {
  frequencyHz = Number(frequencyHz);
  startHz = Number(startHz);
  endHz = Number(endHz);
  minimumDirectWeight = clamp01(minimumDirectWeight);
  if (!Number.isFinite(frequencyHz) || frequencyHz < 0) throw new Error('Hybrid field frequency must be non-negative');
  if (!(startHz > 0 && endHz > startHz)) throw new Error('Hybrid transition requires 0 < startHz < endHz');
  if (frequencyHz <= 0) return minimumDirectWeight;
  const logStart = Math.log(startHz);
  const logEnd = Math.log(endHz);
  const position = (Math.log(Math.max(frequencyHz, startHz)) - logStart) / (logEnd - logStart);
  return minimumDirectWeight + (1 - minimumDirectWeight) * smoothstep(position);
}

class HybridAcousticField {
  constructor({ modalField, directField, transitionStartHz = 20, transitionEndHz = 500, minimumDirectWeight = .22 } = {}) {
    if (!modalField?.sampleComplexAtFrequency) throw new Error('HybridAcousticField requires a modalField with sampleComplexAtFrequency()');
    if (!directField?.sampleComplexAtFrequency) throw new Error('HybridAcousticField requires a directField with sampleComplexAtFrequency()');
    this.modalField = modalField;
    this.directField = directField;
    this.transitionStartHz = Number(transitionStartHz);
    this.transitionEndHz = Number(transitionEndHz);
    this.minimumDirectWeight = Number(minimumDirectWeight);
    this.range = [0, Infinity];
    this.frequency = null;
    this.frequencyRange = null;
  }

  weightsAt(frequencyHz) {
    const direct = logarithmicTransitionWeight(frequencyHz, this.transitionStartHz, this.transitionEndHz, this.minimumDirectWeight);
    return { modal: 1 - direct, direct };
  }

  sampleComponentsComplexAtFrequency(x, y, z, frequencyHz) {
    return {
      modal: this.modalField.sampleComplexAtFrequency(x, y, z, frequencyHz),
      direct: this.directField.sampleComplexAtFrequency(x, y, z, frequencyHz),
      weights: this.weightsAt(frequencyHz),
    };
  }

  sampleComplexAtFrequency(x, y, z, frequencyHz) {
    const { modal, direct, weights } = this.sampleComponentsComplexAtFrequency(x, y, z, frequencyHz);
    return Complex.add(
      [modal[0] * weights.modal, modal[1] * weights.modal],
      [direct[0] * weights.direct, direct[1] * weights.direct],
    );
  }

  sampleAtFrequency(x, y, z, frequencyHz) {
    return Complex.magnitude(this.sampleComplexAtFrequency(x, y, z, frequencyHz));
  }

  sampleComplex(x, y, z, frequencyHz = this.frequency) {
    if (frequencyHz == null) throw new Error('HybridAcousticField sampleComplex requires a frequency');
    return this.sampleComplexAtFrequency(x, y, z, frequencyHz);
  }

  sample(x, y, z, frequencyHz = this.frequency) {
    if (frequencyHz == null) throw new Error('HybridAcousticField sample requires a frequency');
    return this.sampleAtFrequency(x, y, z, frequencyHz);
  }
}

export { HybridAcousticField, logarithmicTransitionWeight, smoothstep };
