import { Complex } from './complex.js';

function vec(value, length, name) {
  if (!Array.isArray(value) || value.length !== length || value.some(item => !Number.isFinite(item))) throw new Error(`${name} must contain ${length} finite numbers`);
  return [...value];
}

class Speaker {
  constructor({ id, name = id, position = [0, 0, 0], orientation = [0, 0, 0, 1], frequencyResponse = [], signalChain = null, enabled = true } = {}) {
    if (typeof id !== 'string' || !id) throw new Error('Speaker requires a non-empty id');
    this.id = id;
    this.name = String(name ?? id);
    this.position = vec(position, 3, 'Speaker position');
    this.orientation = vec(orientation, 4, 'Speaker orientation');
    this.frequencyResponse = [...frequencyResponse].map(point => vec(point, 2, 'Frequency response point')).sort((a, b) => a[0] - b[0]);
    this.signalChain = signalChain;
    this.enabled = Boolean(enabled);
    this.listeners = new Map();
  }
  on(event, listener) {
    const values = this.listeners.get(event) ?? new Set();
    values.add(listener);
    this.listeners.set(event, values);
    return () => values.delete(listener);
  }
  emit(event, detail = {}) { for (const listener of this.listeners.get(event) ?? []) listener({ type: event, target: this, ...detail }); }
  setPosition(value) { const previous = this.position; this.position = vec(value, 3, 'Speaker position'); this.emit('positionChanged', { previous, position: [...this.position] }); return this; }
  setOrientation(value) { const previous = this.orientation; this.orientation = vec(value, 4, 'Speaker orientation'); this.emit('orientationChanged', { previous, orientation: [...this.orientation] }); return this; }
  setEnabled(value) { this.enabled = Boolean(value); this.emit('enabledChanged', { enabled: this.enabled }); return this; }
  setSignalChain(value) { this.signalChain = value; this.emit('signalChainChanged', { signalChain: value }); return this; }
  responseDb(frequencyHz) {
    const points = this.frequencyResponse;
    if (!points.length) return 0;
    if (frequencyHz <= points[0][0]) return points[0][1];
    if (frequencyHz >= points.at(-1)[0]) return points.at(-1)[1];
    const upperIndex = points.findIndex(point => point[0] >= frequencyHz);
    const lower = points[upperIndex - 1];
    const upper = points[upperIndex];
    const ratio = (frequencyHz - lower[0]) / (upper[0] - lower[0]);
    return lower[1] + (upper[1] - lower[1]) * ratio;
  }
  transferAt(frequencyHz) {
    const response = [10 ** (this.responseDb(frequencyHz) / 20), 0];
    const chain = this.signalChain?.evaluateFrequencyResponse(frequencyHz) ?? [1, 0];
    return Complex.multiply(response, chain);
  }
}

export { Speaker };
