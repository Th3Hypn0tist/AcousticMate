const AGGREGATIONS = new Set(['peak', 'rms', 'energy', 'sum']);

function frequencySamples(minHz, maxHz, count = 12) {
  minHz = Number(minHz);
  maxHz = Number(maxHz);
  count = Math.max(1, Math.floor(Number(count) || 1));
  if (!Number.isFinite(minHz) || !Number.isFinite(maxHz) || minHz < 0 || maxHz < minHz) throw new Error('Frequency samples require 0 <= minHz <= maxHz');
  if (count === 1 || maxHz === minHz) return [minHz];
  return Array.from({ length: count }, (_, index) => minHz + (maxHz - minHz) * index / (count - 1));
}

function aggregateMagnitudes(values, mode) {
  if (!values.length) return 0;
  if (mode === 'peak') return Math.max(...values);
  if (mode === 'rms') return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
  if (mode === 'energy') return values.reduce((sum, value) => sum + value * value, 0);
  if (mode === 'sum') return values.reduce((sum, value) => sum + value, 0);
  throw new Error(`Unknown frequency aggregation: ${mode}`);
}

class AggregatedFrequencyField {
  constructor({ field, minHz = 20, maxHz = 140, aggregation = 'rms', samples = 12 } = {}) {
    if (!field || typeof field.sampleAtFrequency !== 'function') throw new Error('AggregatedFrequencyField requires a field with sampleAtFrequency()');
    this.field = field;
    this.samples = Math.max(1, Math.floor(Number(samples) || 1));
    this.setRange(minHz, maxHz);
    this.setAggregation(aggregation);
  }

  setField(field) {
    if (!field || typeof field.sampleAtFrequency !== 'function') throw new Error('AggregatedFrequencyField requires a field with sampleAtFrequency()');
    this.field = field;
    return this;
  }

  setRange(minHz, maxHz) {
    this.minHz = Number(minHz);
    this.maxHz = Number(maxHz);
    this.frequencies = frequencySamples(this.minHz, this.maxHz, this.samples);
    return this;
  }

  setAggregation(value) {
    if (!AGGREGATIONS.has(value)) throw new Error(`Unknown frequency aggregation: ${value}`);
    this.aggregation = value;
    return this;
  }

  setSampleCount(value) {
    value = Math.max(1, Math.floor(Number(value) || 1));
    this.samples = value;
    this.frequencies = frequencySamples(this.minHz, this.maxHz, value);
    return this;
  }

  sample(x, y, z) {
    const values = this.frequencies.map(frequency => this.field.sampleAtFrequency(x, y, z, frequency));
    return aggregateMagnitudes(values, this.aggregation);
  }
}

export { AggregatedFrequencyField, AGGREGATIONS, aggregateMagnitudes, frequencySamples };
