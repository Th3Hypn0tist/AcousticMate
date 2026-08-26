import { Scene, Box, PerspectiveCamera, Viewport, OrbitControls, PlaneDragController } from '../vendor/S3D/s3d.js';
import { FrequencyRangeController, SampledFieldPlane, SpeakerNode } from '../vendor/S3D/domains/acoustics/index.js';
import { WebGUI } from '../vendor/WebGUI/webgui.js';
import { RectangularRoomField } from './rectangular-room-field.js';
import { Speaker } from './speaker.js';
import { SignalChain } from './signal-chain.js';
import { Delay, Gain, HighPassFilter, LowPassFilter, ParametricEQ, Polarity } from './signal-processors.js';

const gui = new WebGUI({ theme: new URL('../styles/acousticmate.css', import.meta.url) });
const root = document.querySelector('#app');
const canvas = document.createElement('canvas');
canvas.dataset.role = 'viewport';
const sidebar = gui.stack([], { className: 'sidebar' });
const shell = gui.h('div', { className: 'app-shell' }, [sidebar, canvas]);
root.append(shell);

const dimensions = { width: 6, height: 2.7, depth: 4.5 };
const frequency = new FrequencyRangeController({ minHz: 20, maxHz: 140, selectedHz: 58, mode: 'single' });
const speakerModels = [];
const speakerNodes = [];
const scene = new Scene();

scene.add(new Box({
  id: 'room-outline',
  position: [dimensions.width / 2, dimensions.height / 2, dimensions.depth / 2],
  scale: [dimensions.width / 2, dimensions.height / 2, dimensions.depth / 2],
  color: [.32, .42, .58],
  outline: true,
  selectable: false,
}));

const roomField = new RectangularRoomField({
  dimensions,
  speakers: speakerModels,
  frequency: frequency.selectedHz,
  maxFrequency: frequency.maxHz,
});

const fieldView = scene.add(new SampledFieldPlane({
  id: 'live-field',
  field: roomField,
  bounds: { min: [0, .035, 0], max: [dimensions.width, .035, dimensions.depth] },
  resolution: [42, 32],
  height: .018,
}));

const camera = new PerspectiveCamera({
  position: [8.5, 7.2, 9],
  target: [dimensions.width / 2, .6, dimensions.depth / 2],
  near: .05,
  far: 100,
});
const viewport = new Viewport(canvas, { camera }).start(scene);
const orbit = new OrbitControls(canvas, camera);
const drag = new PlaneDragController(canvas, camera, { candidates: () => speakerNodes, planeY: .22 });

const frequencyValue = gui.h('output', { text: `${frequency.selectedHz.toFixed(1)} Hz` });
const frequencySlider = gui.input({
  type: 'range', min: frequency.minHz, max: frequency.maxHz, step: .1, value: frequency.selectedHz,
  on: { input: event => frequency.setSelectedFrequency(Number(event.target.value)) },
});
const speakerList = gui.stack([], { className: 'speaker-list' });

function invalidateField() {
  roomField.invalidate();
  fieldView.invalidate();
}

function numberControl(label, value, { min, max, step = .1, update }) {
  const input = gui.input({
    type: 'number', value, min, max, step,
    on: { input: event => {
      if (event.target.value === '') return;
      const next = Number(event.target.value);
      if (!Number.isFinite(next) || (min != null && next < min) || (max != null && next > max)) {
        event.target.setAttribute('aria-invalid', 'true');
        return;
      }
      event.target.removeAttribute('aria-invalid');
      update(next);
      invalidateField();
    } },
  });
  return gui.field(label, input, { className: 'compact-field' });
}

function filterControls(label, processor) {
  const order = gui.select({
    value: String(processor.order),
    on: { change: event => { processor.setOrder(Number(event.target.value)); invalidateField(); } },
  }, [1, 2, 3, 4, 6, 8].map(value => gui.option(String(value), String(value), { disabled: processor.family === 'LinkwitzRiley' && value % 2 !== 0 })));
  const family = gui.select({
    value: processor.family,
    on: { change: event => {
      processor.setFamily(event.target.value, false);
      if (processor.family === 'LinkwitzRiley' && processor.order % 2 !== 0) processor.setOrder(2);
      order.value = String(processor.order);
      for (const option of order.options) option.disabled = processor.family === 'LinkwitzRiley' && Number(option.value) % 2 !== 0;
      invalidateField();
    } },
  }, ['Butterworth', 'LinkwitzRiley', 'Bessel'].map(value => gui.option(value, value === 'LinkwitzRiley' ? 'Linkwitz–Riley' : value)));
  return gui.h('fieldset', { className: 'processor-group' }, [
    gui.h('legend', {}, [gui.input({ type: 'checkbox', checked: processor.enabled, on: { change: event => { processor.setEnabled(event.target.checked); invalidateField(); } } }), ` ${label}`]),
    gui.field('Family', family, { className: 'compact-field' }),
    gui.field('Order', order, { className: 'compact-field' }),
    numberControl('Frequency (Hz)', processor.frequency, { min: 1, max: 1000, step: 1, update: value => processor.setFrequency(value) }),
  ]);
}

function buildSignalControls(speaker) {
  const { gain, delay, polarity, highPass, lowPass, peq } = speaker.processors;
  return gui.h('div', { className: 'signal-controls' }, [
    numberControl('Gain (dB)', gain.db, { min: -60, max: 24, update: value => gain.setDb(value) }),
    numberControl('Delay (ms)', delay.ms, { min: -100, max: 100, update: value => delay.setMs(value) }),
    gui.field('Invert polarity', gui.input({ type: 'checkbox', checked: polarity.inverted, on: { change: event => { polarity.setInverted(event.target.checked); invalidateField(); } } }), { className: 'check-field' }),
    filterControls('High-pass filter', highPass),
    filterControls('Low-pass filter', lowPass),
    gui.h('fieldset', { className: 'processor-group' }, [
      gui.h('legend', {}, [gui.input({ type: 'checkbox', checked: peq.enabled, on: { change: event => { peq.setEnabled(event.target.checked); invalidateField(); } } }), ' Parametric EQ']),
      numberControl('Frequency (Hz)', peq.frequency, { min: 1, max: 1000, step: 1, update: value => peq.setFrequency(value) }),
      numberControl('Gain (dB)', peq.gain, { min: -24, max: 24, update: value => peq.setGain(value) }),
      numberControl('Q', peq.q, { min: .1, max: 30, step: .1, update: value => peq.setQ(value) }),
    ]),
  ]);
}

function buildSpeakerCard(speaker) {
  const coordinates = gui.h('span', { className: 'coordinates' });
  const enabled = gui.button('', { on: { click: () => {
    speaker.setEnabled(!speaker.enabled);
    speaker.node.setEnabled(speaker.enabled);
    enabled.textContent = speaker.enabled ? 'On' : 'Off';
    invalidateField();
  } } });
  speaker.ui = { coordinates, enabled };
  const card = gui.h('section', { className: 'speaker-card' }, [
    gui.h('div', { className: 'speaker-heading' }, [gui.h('strong', { text: speaker.name }), enabled]),
    coordinates,
    gui.h('details', { className: 'signal-chain' }, [gui.h('summary', { text: 'Signal chain' }), buildSignalControls(speaker)]),
  ]);
  speakerList.append(card);
  updateSpeakerCard(speaker);
}

function updateSpeakerCard(speaker) {
  const [x, y, z] = speaker.position;
  speaker.ui.coordinates.textContent = `x ${x.toFixed(2)} · y ${y.toFixed(2)} · z ${z.toFixed(2)}`;
  speaker.ui.enabled.textContent = speaker.enabled ? 'On' : 'Off';
}

function addSpeaker(position = null) {
  const index = speakerModels.length;
  const id = `speaker-${index + 1}`;
  const processors = {
    gain: new Gain({ id: `${id}-gain`, db: 0 }),
    delay: new Delay({ id: `${id}-delay`, ms: 0 }),
    polarity: new Polarity({ id: `${id}-polarity`, inverted: false }),
    highPass: new HighPassFilter({ id: `${id}-hpf`, enabled: false, family: 'Butterworth', order: 2, frequency: 20 }),
    lowPass: new LowPassFilter({ id: `${id}-lpf`, enabled: false, family: 'LinkwitzRiley', order: 4, frequency: 80 }),
    peq: new ParametricEQ({ id: `${id}-peq`, enabled: false, frequency: 60, gain: 0, q: 1 }),
  };
  const model = new Speaker({
    id,
    name: `Speaker ${index + 1}`,
    position: position ?? [1 + (index % 4) * 1.1, .22, .8 + Math.floor(index / 4) * 1.1],
    signalChain: new SignalChain({ processors: Object.values(processors) }),
    enabled: true,
  });
  model.processors = processors;
  const node = new SpeakerNode({ id: `${model.id}-node`, name: model.name, position: model.position });
  model.node = node;
  node.on('positionChanged', event => {
    model.setPosition(event.position);
    invalidateField();
    updateSpeakerCard(model);
  });
  speakerModels.push(model);
  speakerNodes.push(node);
  scene.add(node);
  buildSpeakerCard(model);
  invalidateField();
  return model;
}

frequency.on('selectedFrequencyChanged', state => {
  frequencyValue.textContent = `${state.selectedHz.toFixed(1)} Hz`;
  roomField.setFrequency(state.selectedHz);
  fieldView.invalidate();
});

gui.mount(sidebar, [
  gui.h('header', {}, [gui.h('h1', { text: 'AcousticMate' }), gui.h('p', { text: 'Live room-mode field' })]),
  gui.field('Frequency', gui.stack([frequencySlider, frequencyValue])),
  gui.button('Add speaker', { on: { click: () => addSpeaker() } }),
  gui.h('p', { className: 'hint', text: 'Drag speakers with LMB. Orbit with RMB. Zoom with the wheel.' }),
  speakerList,
]);

addSpeaker([1.2, .22, 1]);
addSpeaker([4.8, .22, 1]);
globalThis.acousticMateStarted = true;

globalThis.addEventListener('beforeunload', () => {
  drag.destroy();
  orbit.destroy();
  viewport.destroy();
  gui.destroy();
}, { once: true });
