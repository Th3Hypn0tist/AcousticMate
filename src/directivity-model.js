import { inverseRotateVector } from './spatial.js';

const MODES = new Set(['simple-coverage', 'polar-data', 'omni', 'custom']);
const POLAR_UNITS = new Set(['linear', 'db']);

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

function numericAxis(value, name, { min = -Infinity, max = Infinity, positive = false } = {}) {
  if (!Array.isArray(value) || !value.length) throw new Error(`${name} must be a non-empty array`);
  const axis = value.map(Number);
  if (axis.some(item => !Number.isFinite(item) || item < min || item > max || (positive && item <= 0))) throw new Error(`${name} contains an invalid value`);
  for (let index = 1; index < axis.length; index++) if (axis[index] <= axis[index - 1]) throw new Error(`${name} must be strictly increasing`);
  return axis;
}

function normalizePolarGrid(value) {
  if (value == null) return null;
  if (typeof value?.gainLinear === 'function') return value;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('polarData must be an object');
  const frequencies = numericAxis(value.frequencies, 'polarData.frequencies', { positive: true });
  const azimuths = numericAxis(value.azimuths, 'polarData.azimuths', { min: -180, max: 180 });
  const elevations = numericAxis(value.elevations, 'polarData.elevations', { min: -90, max: 90 });
  const unit = value.unit ?? 'linear';
  if (!POLAR_UNITS.has(unit)) throw new Error('polarData.unit must be linear or db');
  if (!Array.isArray(value.gains) || value.gains.length !== frequencies.length) throw new Error('polarData.gains must have one elevation/azimuth grid per frequency');
  const gains = value.gains.map((frequencyGrid, frequencyIndex) => {
    if (!Array.isArray(frequencyGrid) || frequencyGrid.length !== elevations.length) throw new Error(`polarData.gains[${frequencyIndex}] must have one row per elevation`);
    return frequencyGrid.map((row, elevationIndex) => {
      if (!Array.isArray(row) || row.length !== azimuths.length) throw new Error(`polarData.gains[${frequencyIndex}][${elevationIndex}] must have one value per azimuth`);
      return row.map(raw => {
        const number = Number(raw);
        if (!Number.isFinite(number)) throw new Error('polarData gain values must be finite');
        const linear = unit === 'db' ? 10 ** (number / 20) : number;
        if (linear < 0) throw new Error('polarData linear gain must be non-negative');
        return linear;
      });
    });
  });
  return { frequencies, azimuths, elevations, gains, unit: 'linear' };
}

function linearBracket(axis, value) {
  if (axis.length === 1 || value <= axis[0]) return [0, 0, 0];
  if (value >= axis.at(-1)) return [axis.length - 1, axis.length - 1, 0];
  const upper = axis.findIndex(item => item >= value);
  const lower = upper - 1;
  return [lower, upper, (value - axis[lower]) / (axis[upper] - axis[lower])];
}

function circularBracket(axis, angleDeg) {
  const angle = wrappedAngle(angleDeg);
  if (axis.length === 1) return [0, 0, 0];
  if (angle >= axis[0] && angle <= axis.at(-1)) return linearBracket(axis, angle);
  const lowerIndex = axis.length - 1;
  const upperIndex = 0;
  const lower = axis[lowerIndex] - (angle < axis[0] ? 360 : 0);
  const upper = axis[upperIndex] + (angle > axis.at(-1) ? 360 : 0);
  const target = angle;
  return [lowerIndex, upperIndex, (target - lower) / (upper - lower)];
}

function lerp(a, b, t) { return a + (b - a) * t; }

function samplePolarGrid(grid, frequencyHz, azimuthDeg, elevationDeg) {
  const [f0, f1, ft] = linearBracket(grid.frequencies, Number(frequencyHz));
  const [a0, a1, at] = circularBracket(grid.azimuths, Number(azimuthDeg));
  const [e0, e1, et] = linearBracket(grid.elevations, Number(elevationDeg));
  const atFrequency = f => {
    const lowElevation = lerp(grid.gains[f][e0][a0], grid.gains[f][e0][a1], at);
    const highElevation = lerp(grid.gains[f][e1][a0], grid.gains[f][e1][a1], at);
    return lerp(lowElevation, highElevation, et);
  };
  return Math.max(0, lerp(atFrequency(f0), atFrequency(f1), ft));
}

class DirectivityModel {
  constructor({ mode, horizontalByFrequency = null, verticalByFrequency = null, polarData = null, evaluator = null } = {}) {
    if (!MODES.has(mode)) throw new Error(`Directivity mode must be one of: ${[...MODES].join(', ')}`);
    this.mode = mode;
    this.horizontalByFrequency = sortedPoints(horizontalByFrequency, 'Horizontal directivity');
    this.verticalByFrequency = sortedPoints(verticalByFrequency, 'Vertical directivity');
    this.polarData = mode === 'polar-data' ? normalizePolarGrid(polarData) : polarData;
    this.evaluator = evaluator;
    if (mode === 'simple-coverage' && !this.horizontalByFrequency?.length && !this.verticalByFrequency?.length) throw new Error('simple-coverage directivity requires horizontal or vertical coverage data');
    if (mode === 'polar-data' && !this.polarData) throw new Error('polar-data directivity requires polarData');
    if (mode === 'custom' && typeof evaluator !== 'function') throw new Error('custom directivity requires an evaluator function');
  }

  coverageAt(frequencyHz) {
    frequencyHz = Number(frequencyHz);
    if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) throw new Error('Frequency must be positive');
    return { horizontal: interpolate(this.horizontalByFrequency, frequencyHz), vertical: interpolate(this.verticalByFrequency, frequencyHz) };
  }

  gainLinear(frequencyHz, azimuthDeg, elevationDeg) {
    if (this.mode === 'omni') return 1;
    if (this.mode === 'custom') return Math.max(0, Number(this.evaluator(frequencyHz, azimuthDeg, elevationDeg)) || 0);
    if (this.mode === 'polar-data') {
      if (typeof this.polarData?.gainLinear === 'function') return Math.max(0, Number(this.polarData.gainLinear(frequencyHz, azimuthDeg, elevationDeg)) || 0);
      return samplePolarGrid(this.polarData, frequencyHz, azimuthDeg, elevationDeg);
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

export {
  DirectivityModel,
  coverageAxisGain,
  normalizePolarGrid,
  samplePolarGrid,
  wrappedAngle,
};
