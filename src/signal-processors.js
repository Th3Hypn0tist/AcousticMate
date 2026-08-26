import { Complex } from './complex.js';

const FILTER_FAMILIES = Object.freeze(['Butterworth', 'LinkwitzRiley', 'Bessel']);

function finite(value, name) {
  value = Number(value);
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
  return value;
}

function positive(value, name) {
  value = finite(value, name);
  if (value <= 0) throw new Error(`${name} must be positive`);
  return value;
}

function orderValue(value, family) {
  value = Number(value);
  if (!Number.isInteger(value) || value < 1 || value > 12) throw new Error('Filter order must be an integer from 1 to 12');
  if (family === 'LinkwitzRiley' && value % 2 !== 0) throw new Error('Linkwitz-Riley filter order must be even');
  return value;
}

class SignalProcessor {
  constructor({ id, enabled = true } = {}) {
    if (typeof id !== 'string' || !id) throw new Error('SignalProcessor requires a non-empty id');
    this.id = id;
    this.enabled = Boolean(enabled);
  }
  setEnabled(value) { this.enabled = Boolean(value); return this; }
  transfer() { return [1, 0]; }
  evaluate(frequencyHz) { return this.enabled ? this.transfer(positive(frequencyHz, 'Frequency')) : [1, 0]; }
}

class Gain extends SignalProcessor {
  constructor({ db = 0, ...options } = {}) { super(options); this.db = finite(db, 'Gain'); }
  setDb(value) { this.db = finite(value, 'Gain'); return this; }
  transfer() { return [10 ** (this.db / 20), 0]; }
}

class Delay extends SignalProcessor {
  constructor({ ms = 0, ...options } = {}) { super(options); this.ms = finite(ms, 'Delay'); }
  setMs(value) { this.ms = finite(value, 'Delay'); return this; }
  transfer(frequencyHz) { return Complex.fromPolar(1, -2 * Math.PI * frequencyHz * this.ms / 1000); }
}

class Polarity extends SignalProcessor {
  constructor({ inverted = false, ...options } = {}) { super(options); this.inverted = Boolean(inverted); }
  setInverted(value) { this.inverted = Boolean(value); return this; }
  transfer() { return [this.inverted ? -1 : 1, 0]; }
}

function butterworthLowPass(order, normalizedFrequency) {
  const s = [0, normalizedFrequency];
  let result = [1, 0];
  for (let index = 0; index < order; index++) {
    const angle = Math.PI * (2 * index + order + 1) / (2 * order);
    const pole = [Math.cos(angle), Math.sin(angle)];
    result = Complex.multiply(result, Complex.divide([-pole[0], -pole[1]], [s[0] - pole[0], s[1] - pole[1]]));
  }
  return result;
}

function factorial(value) {
  let result = 1;
  for (let index = 2; index <= value; index++) result *= index;
  return result;
}

function besselCoefficients(order) {
  return Array.from({ length: order + 1 }, (_, power) => factorial(2 * order - power)
    / (2 ** (order - power) * factorial(order - power) * factorial(power)));
}

function polynomial(coefficients, value) {
  let result = [0, 0];
  for (let index = coefficients.length - 1; index >= 0; index--) {
    result = Complex.add(Complex.multiply(result, value), [coefficients[index], 0]);
  }
  return result;
}

const besselScales = new Map();
function besselScale(order) {
  if (besselScales.has(order)) return besselScales.get(order);
  const coefficients = besselCoefficients(order);
  const numerator = [coefficients[0], 0];
  let low = 0;
  let high = 100;
  for (let iteration = 0; iteration < 80; iteration++) {
    const middle = (low + high) / 2;
    const magnitude = Complex.magnitude(Complex.divide(numerator, polynomial(coefficients, [0, middle])));
    if (magnitude > Math.SQRT1_2) low = middle; else high = middle;
  }
  const result = (low + high) / 2;
  besselScales.set(order, result);
  return result;
}

function besselLowPass(order, normalizedFrequency) {
  const coefficients = besselCoefficients(order);
  return Complex.divide([coefficients[0], 0], polynomial(coefficients, [0, normalizedFrequency * besselScale(order)]));
}

function prototypeLowPass(family, order, normalizedFrequency) {
  if (family === 'LinkwitzRiley') {
    const half = butterworthLowPass(order / 2, normalizedFrequency);
    return Complex.multiply(half, half);
  }
  if (family === 'Bessel') return besselLowPass(order, normalizedFrequency);
  return butterworthLowPass(order, normalizedFrequency);
}

class FrequencyFilter extends SignalProcessor {
  constructor({ family = 'Butterworth', order = 2, frequency = 80, ...options } = {}) {
    super(options);
    this.setFamily(family, false);
    this.setOrder(order);
    this.frequency = positive(frequency, 'Filter frequency');
  }
  setFamily(value, validateOrder = true) {
    if (!FILTER_FAMILIES.includes(value)) throw new Error(`Unsupported filter family: ${value}`);
    this.family = value;
    if (validateOrder && this.order != null) this.order = orderValue(this.order, value);
    return this;
  }
  setOrder(value) { this.order = orderValue(value, this.family); return this; }
  setFrequency(value) { this.frequency = positive(value, 'Filter frequency'); return this; }
}

class LowPassFilter extends FrequencyFilter {
  transfer(frequencyHz) { return prototypeLowPass(this.family, this.order, frequencyHz / this.frequency); }
}

class HighPassFilter extends FrequencyFilter {
  transfer(frequencyHz) {
    const normalized = frequencyHz / this.frequency;
    if (normalized <= Number.EPSILON) return [0, 0];
    return prototypeLowPass(this.family, this.order, 1 / normalized);
  }
}

class ParametricEQ extends SignalProcessor {
  constructor({ frequency = 60, gain = 0, q = 1, ...options } = {}) {
    super(options);
    this.frequency = positive(frequency, 'PEQ frequency');
    this.gain = finite(gain, 'PEQ gain');
    this.q = positive(q, 'PEQ Q');
  }
  setFrequency(value) { this.frequency = positive(value, 'PEQ frequency'); return this; }
  setGain(value) { this.gain = finite(value, 'PEQ gain'); return this; }
  setQ(value) { this.q = positive(value, 'PEQ Q'); return this; }
  transfer(frequencyHz) {
    const ratio = frequencyHz / this.frequency;
    const amplitude = 10 ** (this.gain / 40);
    const s = [0, ratio];
    const sSquared = Complex.multiply(s, s);
    const numerator = Complex.add(Complex.add(sSquared, [1, 0]), [s[0] * amplitude / this.q, s[1] * amplitude / this.q]);
    const denominator = Complex.add(Complex.add(sSquared, [1, 0]), [s[0] / (amplitude * this.q), s[1] / (amplitude * this.q)]);
    return Complex.divide(numerator, denominator);
  }
}

export {
  FILTER_FAMILIES,
  SignalProcessor,
  Gain,
  Delay,
  Polarity,
  HighPassFilter,
  LowPassFilter,
  ParametricEQ,
};
