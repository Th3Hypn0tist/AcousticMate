import test from 'node:test';
import assert from 'node:assert/strict';
import { PhaseAwareFrequencyField, sampleComponent } from '../src/combined-acoustic-field.js';

function owner() {
  return {
    domain: { bounds: { min: [0, 0, 0], max: [1, 1, 1] } },
    frequencyRange: [20, 200],
    roomField: {
      sampleAtFrequency() { return 2; },
      sampleComplexAtFrequency() { return [2, 0]; },
    },
    directField: {
      sampleAtFrequency() { return 3; },
      sampleComplexAtFrequency() { return [3, 0]; },
    },
    hybridField: {
      sampleAtFrequency() { return 5; },
      sampleComplexAtFrequency() { return [5, 0]; },
      sampleComponentsComplexAtFrequency() { return { modal: [2, 0], direct: [3, 0] }; },
    },
  };
}

test('sampleComponent dispatches modal, hybrid and direct explicitly', () => {
  const value = owner();
  assert.equal(sampleComponent(value, 'modal', 0, 0, 0, 63), 2);
  assert.equal(sampleComponent(value, 'direct', 0, 0, 0, 63), 3);
  assert.equal(sampleComponent(value, 'hybrid', 0, 0, 0, 63), 5);
  assert.throws(() => sampleComponent(value, 'unknown', 0, 0, 0, 63), /Unknown acoustic field component/);
});

test('PhaseAwareFrequencyField changes component without replacing field identity', () => {
  const field = new PhaseAwareFrequencyField(owner());
  assert.equal(field.component, 'hybrid');
  assert.equal(field.sample(0, 0, 0, 63), 5);
  field.setComponent('modal');
  assert.equal(field.sample(0, 0, 0, 63), 2);
  field.setComponent('direct');
  assert.equal(field.sample(0, 0, 0, 63), 3);
});

test('component and explicit color reset change the analysis signature', () => {
  const field = new PhaseAwareFrequencyField(owner());
  const initial = field.analysisSignature();
  field.setComponent('modal');
  const modal = field.analysisSignature();
  assert.notEqual(modal, initial);
  field.resetDisplayRange();
  assert.notEqual(field.analysisSignature(), modal);
});
