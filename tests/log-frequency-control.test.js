import test from 'node:test';
import assert from 'node:assert/strict';
import { frequencyToSliderPosition, sliderPositionToFrequency } from '../src/log-frequency-control.js';

test('log frequency control maps endpoints exactly', () => {
  assert.equal(frequencyToSliderPosition(20, 20, 20000), 0);
  assert.equal(frequencyToSliderPosition(20000, 20, 20000), 1);
  assert.equal(sliderPositionToFrequency(0, 20, 20000), 20);
  assert.equal(sliderPositionToFrequency(1, 20, 20000), 20000);
});

test('equal octave ratios occupy equal slider distances', () => {
  const positions = [20, 40, 80, 160, 320].map(value => frequencyToSliderPosition(value, 20, 20000));
  const deltas = positions.slice(1).map((value, index) => value - positions[index]);
  for (const delta of deltas.slice(1)) assert.ok(Math.abs(delta - deltas[0]) < 1e-12);
});

test('slider mapping round trips frequency', () => {
  for (const frequency of [20, 58, 100, 1000, 10000, 20000]) {
    const position = frequencyToSliderPosition(frequency, 20, 20000);
    assert.ok(Math.abs(sliderPositionToFrequency(position, 20, 20000) - frequency) < 1e-9);
  }
});
