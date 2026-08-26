import { Scene, Box, PerspectiveCamera, Viewport, OrbitControls, PlaneDragController } from '../vendor/S3D/s3d.js';
import { FrequencyRangeController, SampledFieldPlane, SpeakerNode } from '../vendor/S3D/domains/acoustics/index.js';
import { WebGUI } from '../vendor/WebGUI/webgui.js';
import { RectangularRoomField } from './rectangular-room-field.js';

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

function updateSpeakerList() {
  gui.replace(speakerList, speakerModels.map((speaker, index) => {
    const [x, y, z] = speaker.position;
    return gui.h('div', { className: 'speaker-row' }, [
      gui.h('strong', { text: speaker.name }),
      gui.h('span', { text: `x ${x.toFixed(2)} · y ${y.toFixed(2)} · z ${z.toFixed(2)}` }),
      gui.button(speaker.enabled ? 'On' : 'Off', { on: { click: () => {
        speaker.enabled = !speaker.enabled;
        speaker.node.setEnabled(speaker.enabled);
        fieldView.invalidate();
        updateSpeakerList();
      } } }),
    ]);
  }));
}

function addSpeaker(position = null) {
  const index = speakerModels.length;
  const model = {
    id: `speaker-${index + 1}`,
    name: `Speaker ${index + 1}`,
    position: position ?? [1 + (index % 4) * 1.1, .22, .8 + Math.floor(index / 4) * 1.1],
    gainDb: 0,
    delayMs: 0,
    polarityInverted: false,
    enabled: true,
  };
  const node = new SpeakerNode({ id: `${model.id}-node`, name: model.name, position: model.position });
  model.node = node;
  node.on('positionChanged', event => {
    model.position = [...event.position];
    fieldView.invalidate();
    updateSpeakerList();
  });
  speakerModels.push(model);
  speakerNodes.push(node);
  scene.add(node);
  fieldView.invalidate();
  updateSpeakerList();
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

globalThis.addEventListener('beforeunload', () => {
  drag.destroy();
  orbit.destroy();
  viewport.destroy();
  gui.destroy();
}, { once: true });
