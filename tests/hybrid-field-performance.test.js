import test from 'node:test';
import assert from 'node:assert/strict';
import { HybridAcousticField } from '../src/hybrid-acoustic-field.js';
import { DirectSoundField } from '../src/direct-sound-field.js';
import { Speaker } from '../src/speaker.js';

function countedField(value = [1, 0]) {
  const state = { calls: 0 };
  return {
    state,
    sampleComplexAtFrequency() { state.calls += 1; return value; },
  };
}

test('HybridAcousticField skips modal sampling above the direct transition endpoint', () => {
  const modal = countedField([100, 0]);
  const direct = countedField([2, 0]);
  const field = new HybridAcousticField({ modalField: modal, directField: direct, transitionStartHz: 20, transitionEndHz: 500 });
  const result = field.sampleComplexAtFrequency(1, 1, 1, 915.2);
  assert.deepEqual(result, [2, 0]);
  assert.equal(modal.state.calls, 0);
  assert.equal(direct.state.calls, 1);
});

test('DirectSoundField prepares source transfer once per frequency until invalidated', () => {
  let transferCalls = 0;
  const speaker = new Speaker({ id: 'source', position: [0, 0, 0] });
  speaker.transferAt = frequencyHz => { transferCalls += 1; return [frequencyHz / frequencyHz, 0]; };
  const field = new DirectSoundField({ speakers: [speaker] });
  field.sampleAtFrequency(1, 0, 0, 1000);
  field.sampleAtFrequency(2, 0, 0, 1000);
  field.sampleAtFrequency(3, 0, 0, 1000);
  assert.equal(transferCalls, 1);
  field.invalidate();
  field.sampleAtFrequency(1, 0, 0, 1000);
  assert.equal(transferCalls, 2);
});
