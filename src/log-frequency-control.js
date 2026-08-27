function validateBounds(minHz, maxHz) {
  minHz = Number(minHz);
  maxHz = Number(maxHz);
  if (!Number.isFinite(minHz) || !Number.isFinite(maxHz) || minHz <= 0 || maxHz <= minHz) {
    throw new Error('Log frequency bounds require 0 < minHz < maxHz');
  }
  return [minHz, maxHz];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function frequencyToSliderPosition(frequencyHz, minHz = 20, maxHz = 20000) {
  [minHz, maxHz] = validateBounds(minHz, maxHz);
  frequencyHz = clamp(Number(frequencyHz), minHz, maxHz);
  if (!Number.isFinite(frequencyHz)) throw new Error('Frequency must be finite');
  return Math.log(frequencyHz / minHz) / Math.log(maxHz / minHz);
}

function sliderPositionToFrequency(position, minHz = 20, maxHz = 20000) {
  [minHz, maxHz] = validateBounds(minHz, maxHz);
  position = clamp(Number(position), 0, 1);
  if (!Number.isFinite(position)) throw new Error('Slider position must be finite');
  return minHz * (maxHz / minHz) ** position;
}

function formatFrequencyInput(frequencyHz) {
  frequencyHz = Number(frequencyHz);
  if (!Number.isFinite(frequencyHz)) return '';
  if (frequencyHz >= 1000) return String(Math.round(frequencyHz));
  if (frequencyHz >= 100) return String(Math.round(frequencyHz * 10) / 10);
  return String(Math.round(frequencyHz * 100) / 100);
}

export { frequencyToSliderPosition, sliderPositionToFrequency, formatFrequencyInput };
