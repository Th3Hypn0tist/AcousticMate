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
  if (!Number.isFinite(minHz) || !Number.isFinite(maxHz) || minHz < 0 || maxHz <= minHz) throw new Error('Frequency range requires 0 <= minHz < maxHz');
  return [minHz, maxHz];
}

class ScalarFieldView extends SceneObject {
  constructor({ id, field, frequency = null, frequencyRange = null, aggregation = 'single', range = null, selectable = false, metadata = {}, ...sceneOptions } = {}) {
    super({ id, selectable, metadata, ...sceneOptions });
    if (!field) throw new Error('ScalarFieldView requires a field');
    this.field = field;
    this.frequency = frequency == null ? null : Number(frequency);
    if (this.frequency != null && (!Number.isFinite(this.frequency) || this.frequency < 0)) throw new Error('ScalarFieldView frequency must be non-negative or null');
    this.frequencyRange = normalizedFrequencyRange(frequencyRange);
    if (!FIELD_AGGREGATIONS.includes(aggregation)) throw new Error(`Unsupported field aggregation: ${aggregation}`);
    this.aggregation = aggregation;
    this.valueRange = normalizedRange(range);
  }
  setField(field) { if (!field) throw new Error('ScalarFieldView requires a field'); this.field = field; this.invalidate?.(); return this; }
  setFrequency(value) { const next = value == null ? null : Number(value); if (next != null && (!Number.isFinite(next) || next < 0)) throw new Error('ScalarFieldView frequency must be non-negative or null'); const previous = this.frequency; this.frequency = next; this.invalidate?.(); this.emit('frequencyChanged', { previous, frequency: next }); return this; }
  setFrequencyRange(value, maxHz = undefined) { const next = maxHz === undefined ? normalizedFrequencyRange(value) : normalizedFrequencyRange([value, maxHz]); const previous = this.frequencyRange ? [...this.frequencyRange] : null; this.frequencyRange = next; this.invalidate?.(); this.emit('frequencyRangeChanged', { previous, frequencyRange: next ? [...next] : null }); return this; }
  setAggregation(value) { if (!FIELD_AGGREGATIONS.includes(value)) throw new Error(`Unsupported field aggregation: ${value}`); const previous = this.aggregation; this.aggregation = value; this.invalidate?.(); this.emit('aggregationChanged', { previous, aggregation: value }); return this; }
  setRange(value) { this.valueRange = normalizedRange(value); this.recolor?.(); return this; }
  show() { this.visible = true; return this; }
  hide() { this.visible = false; return this; }
  destroy() { super.destroy(); }
}

export { ScalarFieldView, FIELD_AGGREGATIONS, normalizedRange, normalizedFrequencyRange };
