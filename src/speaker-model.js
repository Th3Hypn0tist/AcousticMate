import { DirectivityModel } from './directivity-model.js';

const TYPES = new Set(['point-source', 'line-array-element', 'subwoofer', 'column', 'monitor', 'custom']);

function responsePoints(value) {
  if (!Array.isArray(value)) throw new Error('Frequency response must be an array');
  return value.map(point => {
    if (!Array.isArray(point) || point.length !== 2 || point.some(item => !Number.isFinite(item))) throw new Error('Frequency response points must be [Hz, dB]');
    if (point[0] <= 0) throw new Error('Frequency response Hz must be positive');
    return [...point];
  }).sort((a, b) => a[0] - b[0]);
}

function interpolateResponse(points, frequencyHz) {
  if (!points.length) return 0;
  if (frequencyHz <= points[0][0]) return points[0][1];
  if (frequencyHz >= points.at(-1)[0]) return points.at(-1)[1];
  const upperIndex = points.findIndex(point => point[0] >= frequencyHz);
  const lower = points[upperIndex - 1];
  const upper = points[upperIndex];
  const ratio = (frequencyHz - lower[0]) / (upper[0] - lower[0]);
  return lower[1] + (upper[1] - lower[1]) * ratio;
}

class SpeakerModel {
  constructor({ id, manufacturer = null, model, type = 'custom', categories = [], dimensions = null, frequencyRange = null, frequencyResponse = [], directivity = null, metadata = {} } = {}) {
    if (typeof id !== 'string' || !id) throw new Error('SpeakerModel requires a non-empty id');
    if (typeof model !== 'string' || !model) throw new Error('SpeakerModel requires a model name');
    if (!TYPES.has(type)) throw new Error(`Unknown SpeakerModel type: ${type}`);
    this.id = id;
    this.manufacturer = manufacturer == null ? null : String(manufacturer);
    this.model = model;
    this.type = type;
    this.categories = [...categories].map(String);
    if (dimensions == null) this.dimensions = null;
    else {
      const { width, height, depth } = dimensions;
      if (![width, height, depth].every(value => Number.isFinite(value) && value > 0)) throw new Error('SpeakerModel dimensions must be positive');
      this.dimensions = { width, height, depth };
    }
    if (frequencyRange == null) this.frequencyRange = null;
    else {
      if (!Array.isArray(frequencyRange) || frequencyRange.length !== 2 || frequencyRange.some(value => !Number.isFinite(value)) || frequencyRange[0] <= 0 || frequencyRange[1] <= frequencyRange[0]) throw new Error('SpeakerModel frequencyRange must be [minHz, maxHz]');
      this.frequencyRange = [...frequencyRange];
    }
    this.frequencyResponse = responsePoints(frequencyResponse);
    this.directivity = directivity == null || directivity instanceof DirectivityModel ? directivity : new DirectivityModel(directivity);
    this.metadata = { ...metadata };
  }

  responseDb(frequencyHz) { return interpolateResponse(this.frequencyResponse, Number(frequencyHz)); }
  directivityGain(frequencyHz, worldDirection, orientation) {
    return this.directivity?.gainForWorldDirection(frequencyHz, worldDirection, orientation) ?? 1;
  }
}

export { SpeakerModel, interpolateResponse };
