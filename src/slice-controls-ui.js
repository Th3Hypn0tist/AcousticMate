const OPACITY_SPLIT_POSITION = .75;
const OPACITY_MIN_PERCENT = 1;
const OPACITY_SPLIT_PERCENT = 20;
const OPACITY_MAX_PERCENT = 100;

function clamp01(value) {
  value = Number(value);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function logInterpolate(min, max, t) {
  return Math.exp(Math.log(min) + (Math.log(max) - Math.log(min)) * clamp01(t));
}

function inverseLogInterpolate(min, max, value) {
  value = Math.max(min, Math.min(max, Number(value)));
  return (Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min));
}

function sliderPositionToOpacity(position) {
  const t = clamp01(position);
  const percent = t <= OPACITY_SPLIT_POSITION
    ? logInterpolate(OPACITY_MIN_PERCENT, OPACITY_SPLIT_PERCENT, t / OPACITY_SPLIT_POSITION)
    : logInterpolate(OPACITY_SPLIT_PERCENT, OPACITY_MAX_PERCENT, (t - OPACITY_SPLIT_POSITION) / (1 - OPACITY_SPLIT_POSITION));
  return percent / 100;
}

function opacityToSliderPosition(opacity) {
  const percent = Math.max(OPACITY_MIN_PERCENT, Math.min(OPACITY_MAX_PERCENT, Number(opacity) * 100));
  return percent <= OPACITY_SPLIT_PERCENT
    ? inverseLogInterpolate(OPACITY_MIN_PERCENT, OPACITY_SPLIT_PERCENT, percent) * OPACITY_SPLIT_POSITION
    : OPACITY_SPLIT_POSITION + inverseLogInterpolate(OPACITY_SPLIT_PERCENT, OPACITY_MAX_PERCENT, percent) * (1 - OPACITY_SPLIT_POSITION);
}

function installSliceControls(root = document) {
  for (const input of root.querySelectorAll('.slice-controls .slice-control:not(.opacity-control) input[type="range"]')) input.max = '10';

  for (const original of root.querySelectorAll('.slice-controls .opacity-control input[type="range"]')) {
    if (original.dataset.logOpacitySource === 'true') continue;
    original.dataset.logOpacitySource = 'true';

    const slider = original.cloneNode(false);
    slider.removeAttribute('hidden');
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.001';
    slider.value = String(opacityToSliderPosition(Number(original.value)));
    slider.dataset.logOpacityControl = 'true';

    original.hidden = true;
    original.min = '.01';
    original.max = '1';
    original.step = '.001';

    slider.addEventListener('input', () => {
      original.value = String(sliderPositionToOpacity(Number(slider.value)));
      original.dispatchEvent(new Event('input', { bubbles: true }));
    });

    original.before(slider);
  }
}

export {
  OPACITY_MAX_PERCENT,
  OPACITY_MIN_PERCENT,
  OPACITY_SPLIT_PERCENT,
  OPACITY_SPLIT_POSITION,
  installSliceControls,
  opacityToSliderPosition,
  sliderPositionToOpacity,
};
