import { inverseRotateVector } from './spatial.js';

const MODES = new Set(['simple-coverage', 'polar-data', 'omni', 'custom']);

function sortedPoints(value, name) {
  if (value == null) return null;
  if (!Array.isArray(value)) throw new Error(`${name} must be an array or null`);
  return value.map(point => {
    if (!Array.isArray(point) || point.length !== 2 || point.some(item => !Number.isFinite(item))) throw new Error(`${name} points must be [Hz, degrees]`);
    if (point[0] <= 0 || point[1] <= 0 || point[1] > 360) throw new Error(`${name} values must use Hz > 0 and coverage in (0, 360] degrees`);
    return [...point];
  }).sort((a, b) => a[0] - b[0]);
}

function interpolate(points, frequencyHz) {
  if (!points?.length) return null;
  if (frequencyHz <= points[0][0]) return points[0][1];
  if (frequencyHz >= points.at(-1)[0]) return points.at(-1)[1];
  const upperIndex = points.findIndex(point => point[0] >= frequencyHz);
  const lower = points[upperIndex - 1];
  const upper = points[upperIndex];
  const ratio = (frequencyHz - lower[0]) / (upper[0] - lower[0]);
  return lower[1] + (upper[1] - lower[1]) * ratio;
}

function wrappedAngle(value) {
  return ((Number(value) + 180) % 360 + 360) % 360 - 180;
}

function coverageAxisGain(angleDeg, coverageDeg) {
  if (coverageDeg == null || coverageDeg >= 359.999) return 1;
  const halfAngle = coverageDeg / 2;
  return 2 ** -((Math.abs(wrappedAngle(angleDeg)) / halfAngle) ** 2);
}

class DirectivityModel {
  constructor({ mode, horizontalByFrequency = null, verticalByFrequency = null, polarData = null, evaluator = null } = {}) {
    if (!MODES.has(mode)) throw new Error(`Directivity mode must be one of: ${[...MODES].join(', ')}`);
    this.mode = mode;
    this.horizontalByFrequency = sortedPoints(horizontalByFrequency, 'Horizontal directivity');
    this.verticalByFrequency = sortedPoints(verticalByFrequency, 'Vertical directivity');
    this.polarData = polarData;
    this.evaluator = evaluator;
    if (mode === 'simple-coverage' && !this.horizontalByFrequency?.length && !this.verticalByFrequency?.length) throw new Error('simple-coverage directivity requires horizontal or vertical coverage data');
    if (mode === 'custom' && typeof evaluator !== 'function') throw new Error('custom directivity requires an evaluator function');
  }

  coverageAt(frequencyHz) {
    frequencyHz = Number(frequencyHz);
    if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) throw new Error('Frequency must be positive');
    return {
      horizontal: interpolate(this.horizontalByFrequency, frequencyHz),
      vertical: interpolate(this.verticalByFrequency, frequencyHz),
    };
  }

  gainLinear(frequencyHz, azimuthDeg, elevationDeg) {
    if (this.mode === 'omni') return 1;
    if (this.mode === 'custom') return Math.max(0, Number(this.evaluator(frequencyHz, azimuthDeg, elevationDeg)) || 0);
    if (this.mode === 'polar-data') {
      if (typeof this.polarData?.gainLinear === 'function') return Math.max(0, Number(this.polarData.gainLinear(frequencyHz, azimuthDeg, elevationDeg)) || 0);
      throw new Error('Polar-data directivity requires a supported polar-data evaluator');
    }
    const { horizontal, vertical } = this.coverageAt(frequencyHz);
    return coverageAxisGain(azimuthDeg, horizontal) * coverageAxisGain(elevationDeg, vertical);
  }

  gainForWorldDirection(frequencyHz, worldDirection, orientation = [0, 0, 0, 1]) {
    const local = inverseRotateVector(worldDirection, orientation);
    const magnitude = Math.hypot(...local);
    if (magnitude <= Number.EPSILON) return 1;
    const [x, y, z] = local.map(value => value / magnitude);
    const azimuth = Math.atan2(x, z) * 180 / Math.PI;
    const elevation = Math.atan2(y, Math.hypot(x, z)) * 180 / Math.PI;
    return this.gainLinear(frequencyHz, azimuth, elevation);
  }
}

export { DirectivityModel, coverageAxisGain };
