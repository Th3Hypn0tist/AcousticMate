import { Complex } from './complex.js';

class SignalChain {
  constructor({ processors = [] } = {}) {
    this.processors = [];
    for (const processor of processors) this.add(processor);
  }
  add(processor) { return this.insert(this.processors.length, processor); }
  insert(index, processor) {
    if (!processor || typeof processor.evaluate !== 'function') throw new Error('SignalChain processor must implement evaluate(frequencyHz)');
    if (!Number.isInteger(index) || index < 0 || index > this.processors.length) throw new Error('SignalChain insert index is out of range');
    this.processors.splice(index, 0, processor);
    return processor;
  }
  remove(ref) {
    const index = typeof ref === 'number' ? ref : this.processors.indexOf(ref);
    if (index < 0 || index >= this.processors.length) return null;
    return this.processors.splice(index, 1)[0];
  }
  move(from, to) {
    if (![from, to].every(Number.isInteger) || from < 0 || from >= this.processors.length || to < 0 || to >= this.processors.length) {
      throw new Error('SignalChain move indices are out of range');
    }
    const [processor] = this.processors.splice(from, 1);
    this.processors.splice(to, 0, processor);
    return this;
  }
  enable(ref) { this.resolve(ref).setEnabled(true); return this; }
  disable(ref) { this.resolve(ref).setEnabled(false); return this; }
  resolve(ref) {
    const processor = typeof ref === 'string' ? this.processors.find(item => item.id === ref) : ref;
    if (!processor || !this.processors.includes(processor)) throw new Error('SignalChain processor not found');
    return processor;
  }
  clear() { this.processors.length = 0; return this; }
  evaluateFrequencyResponse(frequencyHz) {
    return this.processors.reduce((result, processor) => Complex.multiply(result, processor.evaluate(frequencyHz)), [1, 0]);
  }
}

export { SignalChain };
