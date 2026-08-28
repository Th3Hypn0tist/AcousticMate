function positiveNumber(value, name) {
  value = Number(value);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive`);
  return value;
}

function normalizedResolution(value, name = 'resolution') {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`${name} must be [u,v]`);
  const resolution = value.map(Number);
  if (resolution.some(item => !Number.isInteger(item) || item < 2)) throw new Error(`${name} values must be integers >= 2`);
  return resolution;
}

function normalizedLengths(value) {
  if (!Array.isArray(value) || value.length !== 2) throw new Error('Spatial sampling lengths must be [u,v]');
  return value.map((length, index) => positiveNumber(length, `Spatial sampling length ${index}`));
}

function viewSamplingFrequency({ frequency = null, frequencyRange = null } = {}) {
  if (Array.isArray(frequencyRange) && frequencyRange.length === 2) {
    const maxHz = Number(frequencyRange[1]);
    if (Number.isFinite(maxHz) && maxHz >= 0) return maxHz;
  }
  const selected = Number(frequency);
  return Number.isFinite(selected) && selected >= 0 ? selected : 0;
}

class SpatialSamplingPolicy {
  constructor({ speedOfSound = 343, samplesPerWavelength = 2.5, maxResolutionScale = 3 } = {}) {
    this.speedOfSound = positiveNumber(speedOfSound, 'SpatialSamplingPolicy speedOfSound');
    this.samplesPerWavelength = positiveNumber(samplesPerWavelength, 'SpatialSamplingPolicy samplesPerWavelength');
    if (this.samplesPerWavelength < 2) throw new Error('SpatialSamplingPolicy samplesPerWavelength must be >= 2');
    this.maxResolutionScale = positiveNumber(maxResolutionScale, 'SpatialSamplingPolicy maxResolutionScale');
    if (this.maxResolutionScale < 1) throw new Error('SpatialSamplingPolicy maxResolutionScale must be >= 1');
  }

  resolutionFor({ lengths, baseResolution, frequencyHz = 0 } = {}) {
    lengths = normalizedLengths(lengths);
    baseResolution = normalizedResolution(baseResolution, 'Spatial sampling baseResolution');
    frequencyHz = Number(frequencyHz);
    if (!Number.isFinite(frequencyHz) || frequencyHz < 0) throw new Error('Spatial sampling frequencyHz must be non-negative');

    const required = lengths.map((length, index) => Math.max(
      baseResolution[index],
      Math.ceil(length * frequencyHz * this.samplesPerWavelength / this.speedOfSound),
    ));
    const caps = baseResolution.map(value => Math.max(value, Math.floor(value * this.maxResolutionScale)));
    const resolution = required.map((value, index) => Math.min(value, caps[index]));
    const axisLimitsHz = lengths.map((length, index) => this.speedOfSound * resolution[index] / (this.samplesPerWavelength * length));
    const maxResolvableHz = Math.min(...axisLimitsHz);

    return {
      frequencyHz,
      baseResolution,
      requiredResolution: required,
      resolution,
      caps,
      axisLimitsHz,
      maxResolvableHz,
      limited: required.some((value, index) => value > caps[index]),
    };
  }
}

export { SpatialSamplingPolicy, normalizedResolution, viewSamplingFrequency };
