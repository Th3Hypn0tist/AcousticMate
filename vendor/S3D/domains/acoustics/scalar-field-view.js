import { SceneObject } from '../../core/objects/object.js';

const FIELD_AGGREGATIONS = Object.freeze(['single', 'peak', 'rms', 'energy', 'sum']);

function normalizedRange(value) {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length !== 2) throw new Error('Field value range must be [min,max] or null');
  const low = Number(value[0]);
  const high = Number(value[1]);
  if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) throw new Error('Field value range requires finite min <= max');
  return [low, high];
}

function normalizedFrequencyRange(value) {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length !== 2) throw new Error('Frequency range must be [minHz,maxHz] or null');
  const minHz = Number(value[0]);
  const maxHz = Number(value[1]);
  if (!Number.isFinite(minHz) || !Number.isFinite(maxHz) || minHz < 0 || maxHz < minHz) throw new Error('Frequency range requires 0 <= minHz <= maxHz');
  return [minHz, maxHz];
}

function scalarMagnitude(value) {
  if (Array.isArray(value) && value.length >= 2) return Math.hypot(Number(value[0]) || 0, Number(value[1]) || 0);
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
function frequencySamples(range, count = 12) {
  if (!range) return [];
  const [minHz, maxHz] = range;
  count = Math.max(1, Math.floor(Number(count) || 1));
  if (count === 1 || minHz === maxHz) return [minHz];
  return Array.from({ length: count }, (_, index) => minHz + (maxHz - minHz) * index / (count - 1));
}
function aggregateValues(values, mode) {
  if (!values.length) return 0;
  if (mode === 'peak') return Math.max(...values);
  if (mode === 'rms') return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
  if (mode === 'energy') return values.reduce((sum, value) => sum + value * value, 0);
  if (mode === 'sum') return values.reduce((sum, value) => sum + value, 0);
  return values[0];
}

class ScalarFieldView extends SceneObject {
  constructor({ id, field, frequency = null, frequencyRange = null, aggregation = 'single', range = null, frequencySampleCount = 12, selectable = false, metadata = {}, ...sceneOptions } = {}) {
    super({ id, selectable, metadata, ...sceneOptions });
    if (!field) throw new Error('ScalarFieldView requires a field');
    this.field = field;
    this.frequency = frequency == null ? null : Number(frequency);
    if (this.frequency != null && (!Number.isFinite(this.frequency) || this.frequency < 0)) throw new Error('ScalarFieldView frequency must be non-negative or null');
    this.frequencyRange = normalizedFrequencyRange(frequencyRange);
    if (!FIELD_AGGREGATIONS.includes(aggregation)) throw new Error(`Unsupported field aggregation: ${aggregation}`);
    this.aggregation = aggregation;
    this.valueRange = normalizedRange(range);
    this.frequencySampleCount = Math.max(1, Math.floor(Number(frequencySampleCount) || 12));
  }
  setField(field) { if (!field) throw new Error('ScalarFieldView requires a field'); this.field = field; this.invalidate?.(); return this; }
  setFrequency(value) { const next = value == null ? null : Number(value); if (next != null && (!Number.isFinite(next) || next < 0)) throw new Error('ScalarFieldView frequency must be non-negative or null'); const previous = this.frequency; this.frequency = next; this.invalidate?.(); this.emit('frequencyChanged', { previous, frequency: next }); return this; }
  setFrequencyRange(value, maxHz = undefined) { const next = maxHz === undefined ? normalizedFrequencyRange(value) : normalizedFrequencyRange([value, maxHz]); const previous = this.frequencyRange ? [...this.frequencyRange] : null; this.frequencyRange = next; this.invalidate?.(); this.emit('frequencyRangeChanged', { previous, frequencyRange: next ? [...next] : null }); return this; }
  setAggregation(value) { if (!FIELD_AGGREGATIONS.includes(value)) throw new Error(`Unsupported field aggregation: ${value}`); const previous = this.aggregation; this.aggregation = value; this.invalidate?.(); this.emit('aggregationChanged', { previous, aggregation: value }); return this; }
  setFrequencySampleCount(value) { value = Math.floor(Number(value)); if (!Number.isInteger(value) || value < 1) throw new Error('Frequency sample count must be a positive integer'); this.frequencySampleCount = value; this.invalidate?.(); return this; }
  setRange(value) { this.valueRange = normalizedRange(value); this.recolor?.(); return this; }
  sampleFieldAtFrequency(position, frequencyHz) {
    const field = this.field;
    if (typeof field === 'function') return scalarMagnitude(field(...position, frequencyHz));
    if (typeof field?.sampleAtFrequency === 'function') return scalarMagnitude(field.sampleAtFrequency(...position, frequencyHz));
    if (typeof field?.sample === 'function') return scalarMagnitude(field.sample(...position, frequencyHz));
    throw new Error('ScalarFieldView field must be callable or implement sample()');
  }
  sampleField(position) {
    if (this.aggregation !== 'single' && this.frequencyRange) return aggregateValues(frequencySamples(this.frequencyRange, this.frequencySampleCount).map(frequencyHz => this.sampleFieldAtFrequency(position, frequencyHz)), this.aggregation);
    if (this.frequency != null) return this.sampleFieldAtFrequency(position, this.frequency);
    const field = this.field;
    if (typeof field === 'function') return scalarMagnitude(field(...position));
    if (typeof field?.sample === 'function') return scalarMagnitude(field.sample(...position));
    throw new Error('ScalarFieldView field must be callable or implement sample()');
  }
  show() { this.visible = true; return this; }
  hide() { this.visible = false; return this; }
  destroy() { super.destroy(); }
}

export { ScalarFieldView, FIELD_AGGREGATIONS, normalizedRange, normalizedFrequencyRange, scalarMagnitude, frequencySamples, aggregateValues };
