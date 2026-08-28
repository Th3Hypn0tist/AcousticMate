import test from 'node:test';
import assert from 'node:assert/strict';
import { opacityToSliderPosition, sliderPositionToOpacity } from '../src/slice-controls-ui.js';

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test('slice opacity mapping dedicates 75 percent of travel to 1-20 percent', () => {
  close(sliderPositionToOpacity(0), .01);
  close(sliderPositionToOpacity(.75), .20);
  close(sliderPositionToOpacity(1), 1);
});

test('slice opacity mapping is reversible across low and high ranges', () => {
  for (const opacity of [.01, .02, .05, .1, .18, .2, .35, .5, .75, 1]) {
    close(sliderPositionToOpacity(opacityToSliderPosition(opacity)), opacity, 1e-10);
  }
});

test('1-20 percent has three times the slider travel of 20-100 percent', () => {
  close(opacityToSliderPosition(.01), 0);
  close(opacityToSliderPosition(.20), .75);
  close(opacityToSliderPosition(1), 1);
});
