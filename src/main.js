import { Scene, Box, PerspectiveCamera, Viewport, OrbitControls, PlaneDragController } from '../vendor/S3D/s3d.js';
import { FieldViewRangeCoordinator, FrequencyRangeController, OrthogonalFieldSlices, SampledFieldPlane, SpeakerNode } from '../vendor/S3D/domains/acoustics/index.js';
import { WebGUI } from '../vendor/WebGUI/webgui.js';
import { AggregatedFrequencyField } from './aggregated-frequency-field.js';
import { RectangularRoomField } from './rectangular-room-field.js';
import { RectangularRoom } from './room.js';
import { RoomEditor } from './room-editor.js';
import { Speaker } from './speaker.js';
import { SpeakerLibrary } from './speaker-library.js';
import { SpeakerSet } from './speaker-set.js';
import {
  alignMembers,
  applyClusterLayout,
  applyLineArrayLayout,
  applySubArrayLayout,
  distributeMembers,
  mirrorMembers,
} from './speaker-set-layouts.js';
import { eulerDegreesFromQuaternion, quaternionFromEulerDegrees } from './spatial.js';
import { SignalChain } from './signal-chain.js';
import { Delay, Gain, HighPassFilter, LowPassFilter, ParametricEQ, Polarity } from './signal-processors.js';

const gui = new WebGUI({ theme: new URL('../styles/acousticmate.css', import.meta.url) });
const root = document.querySelector('#app');
const canvas = document.createElement('canvas');
canvas.dataset.role = 'viewport';
const sidebar = gui.stack([], { className: 'sidebar' });
const mainPanel = gui.stack([], { className: 'workspace-panel' });
const setEditorPanel = gui.stack([], { className: 'workspace-panel set-editor-panel', hidden: true });
const roomEditorPanel = gui.stack([], { className: 'workspace-panel room-editor-panel', hidden: true });
sidebar.append(mainPanel, setEditorPanel, roomEditorPanel);
const shell = gui.h('div', { className: 'app-shell' }, [sidebar, canvas]);
root.append(shell);

const room = new RectangularRoom({ width: 6, height: 2.7, depth: 4.5 });
const dimensions = room.dimensions;
const frequency = new FrequencyRangeController({ minHz: 20, maxHz: 140, selectedHz: 58, mode: 'single' });
const speakers = [];
const speakerNodes = [];
const speakerSets = [];
const setNodes = [];
let speakerSequence = 0;
let speakerSetSequence = 0;
const scene = new Scene();
const speakerLibrary = new SpeakerLibrary();
const editorState = { set: null, room: false, camera: null };

async function loadSpeakerLibrary() {
  const manifestUrl = new URL('../speaker-library/manifest.json', import.meta.url);
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error(`Failed to load speaker library manifest: ${response.status}`);
  const manifest = await response.json();
  for (const path of manifest.models ?? []) await speakerLibrary.loadDefinition(new URL(path, manifestUrl));
  if (!speakerLibrary.list().length) throw new Error('Speaker library contains no models');
}

await loadSpeakerLibrary();

const roomOutline = scene.add(new Box({
  id: 'room-outline',
  position: [dimensions.width / 2, dimensions.height / 2, dimensions.depth / 2],
  scale: [dimensions.width / 2, dimensions.height / 2, dimensions.depth / 2],
  color: [.32, .42, .58],
  outline: true,
  selectable: false,
}));

const editorOrigin = scene.add(new Box({
  id: 'set-editor-origin',
  position: [0, 0, 0],
  scale: [.06, .06, .06],
  color: [.7, .75, .85],
  outline: true,
  selectable: false,
  visible: false,
}));

const roomField = new RectangularRoomField({
  dimensions,
  openings: room.openings,
  acousticObjects: room.acousticObjects,
  speakers,
  frequency: frequency.selectedHz,
  maxFrequency: frequency.maxHz,
});

const rangeField = new AggregatedFrequencyField({
  field: roomField,
  minHz: frequency.minHz,
  maxHz: frequency.maxHz,
  aggregation: 'rms',
  samples: 12,
});
let rangeAggregation = 'rms';

const field2DView = scene.add(new SampledFieldPlane({
  id: 'live-field-2d',
  field: roomField,
  bounds: { min: [0, .035, 0], max: [dimensions.width, .035, dimensions.depth] },
  resolution: [42, 32],
  height: .018,
}));

const field3DView = scene.add(new OrthogonalFieldSlices({
  id: 'live-field-3d',
  field: roomField,
  bounds: { min: [0, 0, 0], max: [dimensions.width, dimensions.height, dimensions.depth] },
  slices: { x: dimensions.width / 2, y: dimensions.height / 2, z: dimensions.depth / 2 },
  resolution: { xz: [32, 24], xy: [32, 16], yz: [24, 16] },
  thickness: .018,
  opacity: .18,
  opacities: { x: .18, y: .18, z: .18 },
}));
field3DView.visible = false;
field3DView.dirty = false;
let fieldViewMode = '2d';

const fieldRangeCoordinator = new FieldViewRangeCoordinator({ views: [field2DView, field3DView] });
scene.add({
  id: 'field-range-coordinator',
  visible: false,
  update() { fieldRangeCoordinator.update(); },
});

function activeFieldViews() {
  if (fieldViewMode === 'both') return [field2DView, field3DView];
  return fieldViewMode === '3d' ? [field3DView] : [field2DView];
}

function setFieldViewMode(mode) {
  if (!['2d', '3d', 'both'].includes(mode)) throw new Error(`Unknown field view mode: ${mode}`);
  fieldViewMode = mode;
  if (editorState.set || editorState.room) return;
  field2DView.visible = mode !== '3d';
  field3DView.visible = mode !== '2d';
  fieldRangeCoordinator.invalidate();
  for (const view of activeFieldViews()) view.invalidate();
}

function invalidateField() {
  roomField.invalidate();
  fieldRangeCoordinator.invalidate();
  if (!editorState.set && !editorState.room) for (const view of activeFieldViews()) view.invalidate();
}

function ensureFrequencyCoverage() {
  if (Math.abs(roomField.maxFrequency - frequency.maxHz) < 1e-9) return;
  roomField.maxFrequency = frequency.maxHz;
  roomField.rebuildModes();
}

function applyFrequencyMode() {
  ensureFrequencyCoverage();
  const isRange = frequency.mode === 'range';
  if (isRange) {
    rangeField.setRange(frequency.minHz, frequency.maxHz).setAggregation(rangeAggregation);
    field2DView.setField(rangeField);
    field3DView.setField(rangeField);
  } else {
    if (frequency.selectedHz == null) frequency.setSelectedFrequency((frequency.minHz + frequency.maxHz) / 2, false);
    roomField.setFrequency(frequency.selectedHz);
    field2DView.setField(roomField);
    field3DView.setField(roomField);
  }
  fieldRangeCoordinator.invalidate();
  if (!editorState.set && !editorState.room) for (const view of activeFieldViews()) view.invalidate();
}

const camera = new PerspectiveCamera({
  position: [8.5, 7.2, 9],
  target: [dimensions.width / 2, .6, dimensions.depth / 2],
  near: .05,
  far: 100,
});
const viewport = new Viewport(canvas, { camera }).start(scene);
const orbit = new OrbitControls(canvas, camera);

function manipulationCandidates() {
  if (editorState.room) return [];
  if (editorState.set) return editorState.set.members.map(member => member.speaker.node);
  return [
    ...speakerNodes.filter(node => !node.model?.parentSet),
    ...setNodes,
  ];
}

const drag = new PlaneDragController(canvas, camera, {
  candidates: manipulationCandidates,
  planeY: .22,
  minY: () => editorState.set ? -10 : .22,
  maxY: () => editorState.set ? 10 : dimensions.height - .22,
});

const frequencyValue = gui.h('output', { text: `${frequency.selectedHz.toFixed(1)} Hz` });
const frequencySlider = gui.input({
  type: 'range', min: frequency.minHz, max: frequency.maxHz, step: .1, value: frequency.selectedHz,
  on: { input: event => frequency.setSelectedFrequency(Number(event.target.value)) },
});
const frequencyModeSelect = gui.select({
  value: frequency.mode,
  on: { change: event => frequency.setMode(event.target.value) },
}, [gui.option('single', 'Single frequency'), gui.option('range', 'Frequency range')]);
const rangeMinInput = gui.input({ type: 'number', min: 0, step: 1, value: frequency.minHz });
const rangeMaxInput = gui.input({ type: 'number', min: 0, step: 1, value: frequency.maxHz });
const rangeAggregationSelect = gui.select({
  value: rangeAggregation,
  on: { change: event => {
    rangeAggregation = event.target.value;
    rangeField.setAggregation(rangeAggregation);
    if (frequency.mode === 'range') {
      fieldRangeCoordinator.invalidate();
      for (const view of activeFieldViews()) view.invalidate();
    }
  } },
}, [
  gui.option('peak', 'Peak'),
  gui.option('rms', 'RMS'),
  gui.option('energy', 'Energy'),
  gui.option('sum', 'Sum'),
]);
const rangeSampleSelect = gui.select({
  value: String(rangeField.samples),
  on: { change: event => {
    rangeField.setSampleCount(Number(event.target.value));
    if (frequency.mode === 'range') {
      fieldRangeCoordinator.invalidate();
      for (const view of activeFieldViews()) view.invalidate();
    }
  } },
}, [4, 8, 12, 16, 24].map(value => gui.option(String(value), String(value))));
const singleFrequencyControls = gui.stack([frequencySlider, frequencyValue]);
const rangeFrequencyControls = gui.stack([
  gui.row([
    gui.field('Min Hz', rangeMinInput, { className: 'compact-field' }),
    gui.field('Max Hz', rangeMaxInput, { className: 'compact-field' }),
  ]),
  gui.field('Aggregation', rangeAggregationSelect, { className: 'compact-field' }),
  gui.field('Frequency samples', rangeSampleSelect, { className: 'compact-field' }),
]);

function applyFrequencyControlVisibility() {
  singleFrequencyControls.hidden = frequency.mode !== 'single';
  rangeFrequencyControls.hidden = frequency.mode !== 'range';
}

function commitFrequencyRange() {
  const minHz = Number(rangeMinInput.value);
  const maxHz = Number(rangeMaxInput.value);
  try {
    frequency.setRange(minHz, maxHz);
    rangeMinInput.removeAttribute('aria-invalid');
    rangeMaxInput.removeAttribute('aria-invalid');
  } catch (error) {
    rangeMinInput.setAttribute('aria-invalid', 'true');
    rangeMaxInput.setAttribute('aria-invalid', 'true');
    rangeMaxInput.title = error.message;
  }
}
rangeMinInput.addEventListener('change', commitFrequencyRange);
rangeMaxInput.addEventListener('change', commitFrequencyRange);

const speakerList = gui.stack([], { className: 'speaker-list' });
const setList = gui.stack([], { className: 'speaker-list set-list' });
const roomSummary = gui.h('span', { className: 'coordinates' });

function updateRoomSummary() {
  roomSummary.textContent = `${dimensions.width.toFixed(2)} × ${dimensions.depth.toFixed(2)} × ${dimensions.height.toFixed(2)} m · ${room.openings.length} openings · ${(room.acousticObjects ?? []).length} treatments`;
}

function numberControl(label, value, { min, max, step = .1, update, invalidate = true } = {}) {
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
      update?.(next);
      if (invalidate) invalidateField();
    } },
  });
  return gui.field(label, input, { className: 'compact-field' });
}

function orientationControls(target, { local = false, onChanged = null } = {}) {
  let angles = eulerDegreesFromQuaternion(local ? target.localOrientation : target.orientation);
  const update = key => value => {
    angles = { ...angles, [key]: value };
    const orientation = quaternionFromEulerDegrees(angles);
    if (local) onChanged?.(orientation);
    else target.setOrientation(orientation);
    invalidateField();
  };
  return gui.h('div', { className: 'orientation-grid' }, [
    numberControl('Yaw °', angles.yaw, { min: -180, max: 180, step: 1, update: update('yaw'), invalidate: false }),
    numberControl('Pitch °', angles.pitch, { min: -180, max: 180, step: 1, update: update('pitch'), invalidate: false }),
    numberControl('Roll °', angles.roll, { min: -180, max: 180, step: 1, update: update('roll'), invalidate: false }),
  ]);
}

function sliceCountControl(label, axis, value = 1) {
  const output = gui.h('output', { text: String(value) });
  const input = gui.input({
    type: 'range', min: 0, max: 32, step: 1, value,
    on: { input: event => {
      const next = Number(event.target.value);
      output.textContent = String(next);
      field3DView.setSliceCount(axis, next);
      fieldRangeCoordinator.invalidate();
    } },
  });
  return gui.field(label, gui.stack([input, output]), { className: 'slice-control' });
}

function sliceOpacityControl(label, axis, value = .18) {
  const output = gui.h('output', { text: `${Math.round(value * 100)}%` });
  const input = gui.input({
    type: 'range', min: 0, max: 1, step: .01, value,
    on: { input: event => {
      const next = Number(event.target.value);
      output.textContent = `${Math.round(next * 100)}%`;
      field3DView.setAxisOpacity(axis, next);
    } },
  });
  return gui.field(label, gui.stack([input, output]), { className: 'slice-control opacity-control' });
}

const sliceControls = gui.h('details', { className: 'slice-controls' }, [
  gui.h('summary', { text: '3D field slices' }),
  sliceCountControl('X slices', 'x', 1),
  sliceOpacityControl('X opacity', 'x', .18),
  sliceCountControl('Y slices', 'y', 1),
  sliceOpacityControl('Y opacity', 'y', .18),
  sliceCountControl('Z slices', 'z', 1),
  sliceOpacityControl('Z opacity', 'z', .18),
]);

const fieldViewSelector = gui.field('Field view', gui.select({
  value: fieldViewMode,
  on: { change: event => setFieldViewMode(event.target.value) },
}, [
  gui.option('2d', '2D heatmap'),
  gui.option('3d', '3D slices'),
  gui.option('both', '2D + 3D'),
]));

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

function makeProcessors(id) {
  return {
    gain: new Gain({ id: `${id}-gain`, db: 0 }),
    delay: new Delay({ id: `${id}-delay`, ms: 0 }),
    polarity: new Polarity({ id: `${id}-polarity`, inverted: false }),
    highPass: new HighPassFilter({ id: `${id}-hpf`, enabled: false, family: 'Butterworth', order: 2, frequency: 20 }),
    lowPass: new LowPassFilter({ id: `${id}-lpf`, enabled: false, family: 'LinkwitzRiley', order: 4, frequency: 80 }),
    peq: new ParametricEQ({ id: `${id}-peq`, enabled: false, frequency: 60, gain: 0, q: 1 }),
  };
}

function syncSpeakerNode(speaker) {
  const node = speaker.node;
  if (!node) return;
  const editedSet = editorState.set;
  if (editedSet && speaker.parentSet === editedSet) {
    const member = editedSet.memberForSpeaker(speaker);
    node.setPosition(member.localPosition, { emit: false });
    node.visible = true;
    node.draggable = true;
    return;
  }
  node.setPosition(speaker.position, { emit: false });
  node.visible = !editedSet && !editorState.room;
  node.draggable = !speaker.parentSet && !editedSet && !editorState.room;
}

function updateSpeakerCard(speaker) {
  if (!speaker.ui) return;
  const [x, y, z] = speaker.position;
  speaker.ui.coordinates.textContent = `x ${x.toFixed(2)} · y ${y.toFixed(2)} · z ${z.toFixed(2)}`;
  speaker.ui.enabled.textContent = speaker.enabled ? 'On' : 'Off';
}

function removeSpeaker(speaker, { refreshEditor = true } = {}) {
  if (!speaker) return false;
  const parentSet = speaker.parentSet;
  if (parentSet) parentSet.removeMember(speaker);
  if (speaker.node) scene.remove(speaker.node);
  const speakerIndex = speakers.indexOf(speaker);
  if (speakerIndex >= 0) speakers.splice(speakerIndex, 1);
  const nodeIndex = speakerNodes.indexOf(speaker.node);
  if (nodeIndex >= 0) speakerNodes.splice(nodeIndex, 1);
  speaker.ui?.card?.remove();
  speaker.ui = null;
  if (refreshEditor && editorState.set && parentSet === editorState.set) renderSetEditor(parentSet);
  invalidateField();
  return true;
}

function buildSpeakerCard(speaker) {
  const coordinates = gui.h('span', { className: 'coordinates' });
  const enabled = gui.button('', { on: { click: () => {
    speaker.setEnabled(!speaker.enabled);
    speaker.node.setEnabled(speaker.enabled);
    enabled.textContent = speaker.enabled ? 'On' : 'Off';
    invalidateField();
  } } });
  const remove = gui.button('Remove', { className: 'danger-button', on: { click: () => removeSpeaker(speaker) } });
  const modelName = speaker.model ? `${speaker.model.manufacturer ?? ''} ${speaker.model.model}`.trim() : 'Custom speaker';
  const card = gui.h('section', { className: 'speaker-card' }, [
    gui.h('div', { className: 'speaker-heading' }, [
      gui.h('strong', { text: speaker.name }),
      gui.row([enabled, remove], { className: 'speaker-card-actions' }),
    ]),
    gui.h('span', { className: 'model-name', text: modelName }),
    coordinates,
    gui.h('details', { className: 'signal-chain' }, [gui.h('summary', { text: 'Orientation' }), orientationControls(speaker)]),
    gui.h('details', { className: 'signal-chain' }, [gui.h('summary', { text: 'Signal chain' }), buildSignalControls(speaker)]),
  ]);
  speaker.ui = { coordinates, enabled, remove, card };
  speakerList.append(card);
  updateSpeakerCard(speaker);
}

function addSpeaker({ position = null, model = null, parentSet = null, localPosition = null, name = null, buildCard = parentSet == null } = {}) {
  const sequence = ++speakerSequence;
  const id = `speaker-${sequence}`;
  const processors = makeProcessors(id);
  const speaker = new Speaker({
    id,
    name: name ?? `Speaker ${sequence}`,
    model: model ?? speakerLibrary.list()[0],
    position: position ?? [1 + ((sequence - 1) % 4) * 1.1, .22, .8 + Math.floor((sequence - 1) / 4) * 1.1],
    signalChain: new SignalChain({ processors: Object.values(processors) }),
    enabled: true,
  });
  speaker.processors = processors;
  const node = new SpeakerNode({ id: `${speaker.id}-node`, name: speaker.name, position: speaker.position });
  node.model = speaker;
  speaker.node = node;
  node.on('positionChanged', event => {
    if (editorState.set && speaker.parentSet === editorState.set) editorState.set.setMemberPosition(speaker, event.position);
    else if (!speaker.parentSet) speaker.setPosition(event.position);
    invalidateField();
    updateSpeakerCard(speaker);
  });
  speaker.on('positionChanged', () => { syncSpeakerNode(speaker); updateSpeakerCard(speaker); });
  speaker.on('orientationChanged', invalidateField);
  speaker.on('modelChanged', invalidateField);
  speakers.push(speaker);
  speakerNodes.push(node);
  scene.add(node);
  if (parentSet) parentSet.addMember({ speaker, localPosition: localPosition ?? [0, 0, 0] });
  if (buildCard) buildSpeakerCard(speaker);
  syncSpeakerNode(speaker);
  invalidateField();
  return speaker;
}

function updateSetCard(set) {
  if (!set.ui) return;
  const [x, y, z] = set.position;
  set.ui.coordinates.textContent = `x ${x.toFixed(2)} · y ${y.toFixed(2)} · z ${z.toFixed(2)} · ${set.members.length} members`;
  set.ui.enabled.textContent = set.enabled ? 'On' : 'Off';
}

function buildSetCard(set) {
  const coordinates = gui.h('span', { className: 'coordinates' });
  const enabled = gui.button('', { on: { click: () => {
    set.setEnabled(!set.enabled);
    enabled.textContent = set.enabled ? 'On' : 'Off';
    invalidateField();
  } } });
  const edit = gui.button('Edit set', { on: { click: () => openSetEditor(set) } });
  set.ui = { coordinates, enabled };
  const card = gui.h('section', { className: 'speaker-card set-card' }, [
    gui.h('div', { className: 'speaker-heading' }, [gui.h('strong', { text: set.name }), enabled]),
    gui.h('span', { className: 'model-name', text: set.type }),
    coordinates,
    gui.h('details', { className: 'signal-chain' }, [gui.h('summary', { text: 'Set orientation' }), orientationControls(set)]),
    edit,
  ]);
  setList.append(card);
  updateSetCard(set);
}

function createSpeakerSet(type = 'generic') {
  const sequence = ++speakerSetSequence;
  const set = new SpeakerSet({
    id: `set-${sequence}`,
    name: `Speaker Set ${sequence}`,
    type,
    position: [dimensions.width / 2, Math.min(1.6, dimensions.height - .22), dimensions.depth / 2],
  });
  const node = new Box({
    id: `${set.id}-node`,
    position: set.position,
    scale: [.18, .18, .18],
    color: [.22, .85, .72],
    outline: true,
  });
  node.dragRadius = .46;
  node.draggable = true;
  node.model = set;
  set.node = node;
  node.on('positionChanged', event => {
    if (editorState.set || editorState.room) return;
    set.setPosition(event.position);
    updateSetCard(set);
    invalidateField();
  });
  set.on('positionChanged', () => {
    node.setPosition(set.position, { emit: false });
    updateSetCard(set);
    invalidateField();
  });
  set.on('orientationChanged', () => { updateSetCard(set); invalidateField(); });
  set.on('memberAdded', event => { syncSpeakerNode(event.member.speaker); updateSetCard(set); invalidateField(); });
  set.on('memberRemoved', event => { syncSpeakerNode(event.member.speaker); updateSetCard(set); invalidateField(); });
  set.on('memberTransformChanged', event => { syncSpeakerNode(event.member.speaker); invalidateField(); });
  speakerSets.push(set);
  setNodes.push(node);
  scene.add(node);
  buildSetCard(set);
  refreshSceneMode();
  return set;
}

function refreshSceneMode() {
  const editedSet = editorState.set;
  const editingRoom = editorState.room;
  roomOutline.visible = !editedSet;
  editorOrigin.visible = Boolean(editedSet);
  field2DView.visible = !editedSet && !editingRoom && fieldViewMode !== '3d';
  field3DView.visible = !editedSet && !editingRoom && fieldViewMode !== '2d';
  fieldRangeCoordinator.invalidate();
  for (const set of speakerSets) set.node.visible = !editedSet && !editingRoom;
  for (const speaker of speakers) syncSpeakerNode(speaker);
}

function modelSelect({ type = null } = {}) {
  const models = speakerLibrary.list({ type });
  const candidates = models.length ? models : speakerLibrary.list();
  return gui.select({}, candidates.map(model => gui.option(model.id, `${model.manufacturer ?? 'Custom'} · ${model.model}`)));
}

function memberEditor(set, member) {
  const speaker = member.speaker;
  const modelLabel = speaker.model ? `${speaker.model.manufacturer ?? ''} ${speaker.model.model}`.trim() : 'Custom';
  const position = [...member.localPosition];
  const positionGrid = gui.h('div', { className: 'position-grid' }, [0, 1, 2].map((axis, index) => numberControl(['X', 'Y', 'Z'][index], position[axis], {
    min: -20, max: 20, step: .01, invalidate: false,
    update: value => {
      position[axis] = value;
      set.setMemberPosition(speaker, position);
      renderSetEditor(set);
    },
  })));
  const remove = gui.button('Remove', { className: 'danger-button', on: { click: () => removeSpeaker(speaker) } });
  const duplicate = gui.button('Duplicate', { on: { click: () => {
    addSpeaker({
      model: speaker.model,
      parentSet: set,
      localPosition: member.localPosition.map((value, index) => value + (index === 0 ? .15 : 0)),
      name: `${speaker.name} copy`,
      buildCard: false,
    });
    renderSetEditor(set);
  } } });
  return gui.h('section', { className: 'speaker-card member-card' }, [
    gui.h('div', { className: 'speaker-heading' }, [gui.h('strong', { text: speaker.name }), gui.h('span', { className: 'model-name', text: modelLabel })]),
    positionGrid,
    orientationControls(member, { local: true, onChanged: orientation => { set.setMemberOrientation(speaker, orientation); renderSetEditor(set); } }),
    gui.row([duplicate, remove], { className: 'button-row' }),
  ]);
}

function typeHelperControls(set) {
  if (set.type === 'line-array') {
    const values = { spacing: .28, splay: 5, tilt: 0 };
    return gui.h('fieldset', { className: 'set-helper' }, [
      gui.h('legend', { text: 'Line array layout' }),
      numberControl('Spacing (m)', values.spacing, { min: 0, max: 3, step: .01, invalidate: false, update: value => { values.spacing = value; } }),
      numberControl('Splay (°)', values.splay, { min: -30, max: 30, step: .5, invalidate: false, update: value => { values.splay = value; } }),
      numberControl('Array tilt (°)', values.tilt, { min: -90, max: 90, step: .5, invalidate: false, update: value => { values.tilt = value; } }),
      gui.button('Apply line array', { on: { click: () => { applyLineArrayLayout(set, { spacing: values.spacing, splayDeg: values.splay, arrayTiltDeg: values.tilt }); renderSetEditor(set); } } }),
    ]);
  }
  if (set.type === 'cluster') {
    const values = { radius: .35, spread: 60 };
    return gui.h('fieldset', { className: 'set-helper' }, [
      gui.h('legend', { text: 'Cluster layout' }),
      numberControl('Radius (m)', values.radius, { min: 0, max: 10, step: .01, invalidate: false, update: value => { values.radius = value; } }),
      numberControl('Spread (°)', values.spread, { min: -180, max: 180, step: 1, invalidate: false, update: value => { values.spread = value; } }),
      gui.button('Apply cluster', { on: { click: () => { applyClusterLayout(set, { radius: values.radius, spreadDeg: values.spread }); renderSetEditor(set); } } }),
    ]);
  }
  if (set.type === 'sub-array') {
    const values = { spacing: .8, arc: 0, radius: 4 };
    return gui.h('fieldset', { className: 'set-helper' }, [
      gui.h('legend', { text: 'Sub array layout' }),
      numberControl('Spacing (m)', values.spacing, { min: 0, max: 10, step: .01, invalidate: false, update: value => { values.spacing = value; } }),
      numberControl('Arc (°)', values.arc, { min: -180, max: 180, step: 1, invalidate: false, update: value => { values.arc = value; } }),
      numberControl('Radius (m)', values.radius, { min: 0, max: 100, step: .1, invalidate: false, update: value => { values.radius = value; } }),
      gui.button('Apply sub array', { on: { click: () => { applySubArrayLayout(set, { spacing: values.spacing, arcDeg: values.arc, radius: values.radius }); renderSetEditor(set); } } }),
    ]);
  }
  return gui.h('p', { className: 'hint', text: 'Generic set: edit member transforms freely.' });
}

function commonSetHelperControls(set) {
  const apply = operation => {
    operation();
    renderSetEditor(set);
    invalidateField();
  };
  return gui.h('details', { className: 'signal-chain' }, [
    gui.h('summary', { text: 'Align · distribute · mirror' }),
    gui.h('h3', { text: 'Align members' }),
    gui.row([0, 1, 2].map((axis, index) => gui.button(`Align ${['X', 'Y', 'Z'][index]}`, { on: { click: () => apply(() => alignMembers(set, { axis })) } })), { className: 'button-row' }),
    gui.h('h3', { text: 'Distribute members' }),
    gui.row([0, 1, 2].map((axis, index) => gui.button(`Distribute ${['X', 'Y', 'Z'][index]}`, { on: { click: () => apply(() => distributeMembers(set, { axis })) } })), { className: 'button-row' }),
    gui.h('h3', { text: 'Mirror local geometry' }),
    gui.row([0, 1, 2].map((axis, index) => gui.button(`Mirror ${['X', 'Y', 'Z'][index]}`, { on: { click: () => apply(() => mirrorMembers(set, { axis })) } })), { className: 'button-row' }),
  ]);
}

function suggestedModelType(set) {
  if (set.type === 'line-array') return 'line-array-element';
  if (set.type === 'sub-array') return 'subwoofer';
  return null;
}

function renderSetEditor(set = editorState.set) {
  if (!set) return;
  const select = modelSelect({ type: suggestedModelType(set) });
  const add = gui.button('Add member', { on: { click: () => {
    const model = speakerLibrary.get(select.value);
    const index = set.members.length;
    addSpeaker({ model, parentSet: set, localPosition: [index * .35, 0, 0], buildCard: false });
    if (set.type === 'line-array') applyLineArrayLayout(set, { spacing: .28, splayDeg: 5 });
    if (set.type === 'sub-array') applySubArrayLayout(set, { spacing: .8 });
    renderSetEditor(set);
  } } });
  gui.replace(setEditorPanel, [
    gui.h('header', {}, [gui.h('h1', { text: set.name }), gui.h('p', { text: `${set.type} · local geometry editor` })]),
    gui.button('← Back to visualizer', { on: { click: closeSetEditor } }),
    gui.h('div', { className: 'library-add' }, [gui.field('Speaker model', select), add]),
    typeHelperControls(set),
    commonSetHelperControls(set),
    gui.h('div', { className: 'member-list' }, set.members.map(member => memberEditor(set, member))),
    gui.h('p', { className: 'hint', text: 'Drag members in the 3D preview for local X/Z. Shift+drag changes local Y. Numeric controls set exact local position and orientation.' }),
  ]);
}

function openSetEditor(set) {
  if (editorState.set === set || editorState.room) return;
  editorState.camera = { position: [...camera.position], target: [...camera.target] };
  editorState.set = set;
  mainPanel.hidden = true;
  setEditorPanel.hidden = false;
  roomEditorPanel.hidden = true;
  camera.position = [3.6, 2.8, 4.8];
  camera.target = [0, 0, 0];
  renderSetEditor(set);
  refreshSceneMode();
}

function closeSetEditor() {
  const set = editorState.set;
  if (!set) return;
  set.syncAll();
  editorState.set = null;
  setEditorPanel.hidden = true;
  mainPanel.hidden = false;
  if (editorState.camera) {
    camera.position = [...editorState.camera.position];
    camera.target = [...editorState.camera.target];
  }
  editorState.camera = null;
  refreshSceneMode();
  updateSetCard(set);
  invalidateField();
}

function newSetDialogRow() {
  const select = gui.select({}, [
    ['generic', 'Generic'],
    ['line-array', 'Line array'],
    ['cluster', 'Cluster'],
    ['sub-array', 'Sub array'],
    ['stack', 'Stack'],
    ['distributed', 'Distributed'],
  ].map(([value, text]) => gui.option(value, text)));
  return gui.row([
    select,
    gui.button('Add set', { on: { click: () => { const set = createSpeakerSet(select.value); openSetEditor(set); } } }),
  ], { className: 'button-row' });
}

function standaloneSpeakerControls() {
  const select = modelSelect();
  return gui.row([
    select,
    gui.button('Add speaker', { on: { click: () => addSpeaker({ model: speakerLibrary.get(select.value) }) } }),
  ], { className: 'button-row' });
}

const roomEditor = new RoomEditor({
  gui,
  panel: roomEditorPanel,
  room,
  scene,
  camera,
  canvas,
  roomOutline,
  field2DView,
  field3DView,
  roomField,
  dimensions,
  onOpen: () => {
    editorState.room = true;
    mainPanel.hidden = true;
    setEditorPanel.hidden = true;
    roomEditorPanel.hidden = false;
    refreshSceneMode();
  },
  onClose: () => {
    editorState.room = false;
    roomEditorPanel.hidden = true;
    mainPanel.hidden = false;
    refreshSceneMode();
    invalidateField();
  },
  onChanged: () => {
    updateRoomSummary();
    invalidateField();
    refreshSceneMode();
  },
});

frequency.on('selectedFrequencyChanged', state => {
  if (state.selectedHz == null) return;
  frequencyValue.textContent = `${state.selectedHz.toFixed(1)} Hz`;
  frequencySlider.value = String(state.selectedHz);
  if (frequency.mode === 'single') applyFrequencyMode();
});
frequency.on('rangeChanged', state => {
  rangeMinInput.value = String(state.minHz);
  rangeMaxInput.value = String(state.maxHz);
  frequencySlider.min = String(state.minHz);
  frequencySlider.max = String(state.maxHz);
  if (state.selectedHz == null && frequency.mode === 'single') frequency.setSelectedFrequency((state.minHz + state.maxHz) / 2, false);
  applyFrequencyMode();
});
frequency.on('modeChanged', () => {
  applyFrequencyControlVisibility();
  applyFrequencyMode();
});

updateRoomSummary();
applyFrequencyControlVisibility();
applyFrequencyMode();

gui.mount(mainPanel, [
  gui.h('header', {}, [gui.h('h1', { text: 'AcousticMate' }), gui.h('p', { text: 'Live room-mode field' })]),
  gui.h('h2', { text: 'Room' }),
  gui.h('section', { className: 'speaker-card room-card' }, [
    roomSummary,
    gui.button('Edit room', { on: { click: () => roomEditor.open() } }),
  ]),
  gui.field('Analysis mode', frequencyModeSelect),
  gui.field('Frequency', singleFrequencyControls),
  rangeFrequencyControls,
  fieldViewSelector,
  sliceControls,
  gui.h('h2', { text: 'Speakers' }),
  standaloneSpeakerControls(),
  speakerList,
  gui.h('h2', { text: 'Speaker sets' }),
  newSetDialogRow(),
  setList,
  gui.h('p', { className: 'hint', text: 'LMB moves standalone speakers or complete sets on XZ. Shift+LMB changes height. RMB orbits. Wheel zooms.' }),
]);

const defaultModel = speakerLibrary.get('generic/point-source') ?? speakerLibrary.list()[0];
addSpeaker({ position: [1.2, .22, 1], model: defaultModel });
addSpeaker({ position: [4.8, .22, 1], model: defaultModel });
refreshSceneMode();
globalThis.acousticMateStarted = true;

globalThis.addEventListener('beforeunload', () => {
  roomEditor.destroy?.();
  drag.destroy();
  orbit.destroy();
  viewport.destroy();
  gui.destroy();
}, { once: true });
