import { Complex } from './complex.js';
import { DirectivityModel } from './directivity-model.js';
import { normalizeQuaternion, vec3 } from './spatial.js';
import { interpolateResponse, SpeakerModel } from './speaker-model.js';

function responsePoints(value) {
  if (!Array.isArray(value)) throw new Error('Frequency response must be an array');
  return value.map(point => {
    if (!Array.isArray(point) || point.length !== 2 || point.some(item => !Number.isFinite(item))) throw new Error('Frequency response points must be [Hz, dB]');
    return [...point];
  }).sort((a, b) => a[0] - b[0]);
}

class Speaker {
  constructor({ id, name = id, model = null, position = [0, 0, 0], orientation = [0, 0, 0, 1], frequencyResponse = [], directivity = null, signalChain = null, enabled = true } = {}) {
    if (typeof id !== 'string' || !id) throw new Error('Speaker requires a non-empty id');
    this.id = id;
    this.name = String(name ?? id);
    this.model = model == null || model instanceof SpeakerModel ? model : new SpeakerModel(model);
    this.position = vec3(position, 'Speaker position');
    this.orientation = normalizeQuaternion(orientation, 'Speaker orientation');
    this.frequencyResponse = responsePoints(frequencyResponse);
    this.directivity = directivity == null || directivity instanceof DirectivityModel ? directivity : new DirectivityModel(directivity);
    this.signalChain = signalChain;
    this.enabled = Boolean(enabled);
    this.parentSet = null;
    this.listeners = new Map();
  }
  on(event, listener) {
    const values = this.listeners.get(event) ?? new Set();
    values.add(listener);
    this.listeners.set(event, values);
    return () => values.delete(listener);
  }
  emit(event, detail = {}) { for (const listener of this.listeners.get(event) ?? []) listener({ type: event, target: this, ...detail }); }
  setModel(value) { this.model = value == null || value instanceof SpeakerModel ? value : new SpeakerModel(value); this.emit('modelChanged', { model: this.model }); return this; }
  setPosition(value) { const previous = this.position; this.position = vec3(value, 'Speaker position'); this.emit('positionChanged', { previous, position: [...this.position] }); return this; }
  setOrientation(value) { const previous = this.orientation; this.orientation = normalizeQuaternion(value, 'Speaker orientation'); this.emit('orientationChanged', { previous, orientation: [...this.orientation] }); return this; }
  setEnabled(value) { this.enabled = Boolean(value); this.emit('enabledChanged', { enabled: this.enabled }); return this; }
  setSignalChain(value) { this.signalChain = value; this.emit('signalChainChanged', { signalChain: value }); return this; }
  responseDb(frequencyHz) {
    if (this.model) return this.model.responseDb(frequencyHz);
    return interpolateResponse(this.frequencyResponse, frequencyHz);
  }
  localTransferAt(frequencyHz) {
    const response = [10 ** (this.responseDb(frequencyHz) / 20), 0];
    const chain = this.signalChain?.evaluateFrequencyResponse(frequencyHz) ?? [1, 0];
    return Complex.multiply(response, chain);
  }
  transferAt(frequencyHz) {
    const local = this.localTransferAt(frequencyHz);
    return this.parentSet?.transferForSpeaker?.(this, frequencyHz, local) ?? local;
  }
  directivityGain(frequencyHz, worldDirection) {
    if (this.model?.directivity) return this.model.directivityGain(frequencyHz, worldDirection, this.orientation);
    return this.directivity?.gainForWorldDirection(frequencyHz, worldDirection, this.orientation) ?? 1;
  }
  isAcousticallyEnabled() { return this.enabled && this.parentSet?.enabled !== false; }
}

export { Speaker };
