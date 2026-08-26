class FrequencyRangeController {
  constructor({ minHz = 20, maxHz = 200, selectedHz = null, mode = 'range' } = {}) {
    this.listeners = new Map();
    this.minHz = 0;
    this.maxHz = 0;
    this.selectedHz = null;
    this.mode = 'range';
    this.setRange(minHz, maxHz, false);
    this.setSelectedFrequency(selectedHz, false);
    this.setMode(mode, false);
  }

  on(event, listener) {
    if (typeof listener !== 'function') throw new Error('FrequencyRangeController listener must be a function');
    const values = this.listeners.get(event) ?? new Set();
    values.add(listener);
    this.listeners.set(event, values);
    return () => values.delete(listener);
  }

  emit(event) {
    const snapshot = this.snapshot();
    for (const listener of this.listeners.get(event) ?? []) listener(snapshot);
  }

  setMin(value) { return this.setRange(value, this.maxHz); }
  setMax(value) { return this.setRange(this.minHz, value); }
  setRange(minHz, maxHz, emit = true) {
    minHz = Number(minHz);
    maxHz = Number(maxHz);
    if (!Number.isFinite(minHz) || !Number.isFinite(maxHz) || minHz < 0 || maxHz < minHz) {
      throw new Error('Frequency range requires finite values with 0 <= minHz <= maxHz');
    }
    this.minHz = minHz;
    this.maxHz = maxHz;
    if (this.selectedHz != null && (this.selectedHz < minHz || this.selectedHz > maxHz)) this.selectedHz = null;
    if (emit) this.emit('rangeChanged');
    return this;
  }

  setSelectedFrequency(value, emit = true) {
    if (value == null) this.selectedHz = null;
    else {
      value = Number(value);
      if (!Number.isFinite(value) || value < this.minHz || value > this.maxHz) {
        throw new Error('Selected frequency must be inside the configured range');
      }
      this.selectedHz = value;
    }
    if (emit) this.emit('selectedFrequencyChanged');
    return this;
  }

  setMode(value, emit = true) {
    if (value !== 'single' && value !== 'range') throw new Error('Frequency mode must be single or range');
    this.mode = value;
    if (emit) this.emit('modeChanged');
    return this;
  }

  snapshot() {
    return { minHz: this.minHz, maxHz: this.maxHz, selectedHz: this.selectedHz, mode: this.mode };
  }

  destroy() { this.listeners.clear(); }
}

export { FrequencyRangeController };
