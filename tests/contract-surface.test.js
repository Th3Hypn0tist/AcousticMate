import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ImageReferenceLayer,
  PolygonEditor,
  Measurement,
  ConstraintGeometrySolver,
  ExtrudedVolume,
  Box,
} from '../vendor/S3D/s3d.js';
import {
  FrequencyRangeController,
  ScalarFieldView,
  SampledFieldPlane,
  OrthogonalFieldSlices,
} from '../vendor/S3D/domains/acoustics/index.js';
import { AcousticDomain } from '../src/acoustic-domain.js';
import { AcousticObject, AcousticMaterialProfile } from '../src/acoustic-object.js';
import { CombinedAcousticField } from '../src/combined-acoustic-field.js';
import { CrossoverNetwork } from '../src/crossover-network.js';
import { DirectivityModel } from '../src/directivity-model.js';
import { RectangularRoom } from '../src/room.js';
import { RoomEditor } from '../src/room-editor.js';
import { RoomModeSolver } from '../src/room-mode-solver.js';
import { SignalChain } from '../src/signal-chain.js';
import { Gain } from '../src/signal-processors.js';
import { Speaker } from '../src/speaker.js';
import { SpeakerModeCoupling } from '../src/speaker-mode-coupling.js';
import { SpeakerModel } from '../src/speaker-model.js';
import { SpeakerSet } from '../src/speaker-set.js';

function hasMethods(value, names) {
  for (const name of names) assert.equal(typeof value[name], 'function', `${value.constructor?.name ?? 'value'} missing ${name}()`);
}

test('S3D geometry contracts expose their declared operations', () => {
  const image = new ImageReferenceLayer({ id: 'reference' });
  hasMethods(image, ['setImage', 'setOpacity', 'translate', 'rotate', 'scale', 'show', 'hide', 'destroy', 'imageToLocal', 'localToImage']);

  const polygon = new PolygonEditor({
    id: 'polygon',
    vertices: [{ id: 'a', x: 0, z: 0 }, { id: 'b', x: 2, z: 0 }, { id: 'c', x: 0, z: 2 }],
    closed: true,
  });
  hasMethods(polygon, ['addVertex', 'moveVertex', 'removeVertex', 'insertVertex', 'closePolygon', 'openPolygon', 'select', 'clearSelection', 'undo', 'redo']);

  const measurement = new Measurement({ id: 'm', anchors: [{ type: 'vertex', target: 'a' }, { type: 'vertex', target: 'b' }], value: 2 });
  assert.equal(measurement.type, 'distance');

  const solver = new ConstraintGeometrySolver({ iterations: 2 });
  hasMethods(solver, ['solve']);

  const volume = new ExtrudedVolume({ id: 'volume', polygon, height: 2.5 });
  hasMethods(volume, ['setPolygon', 'setHeight', 'rebuild', 'destroy']);
});

test('S3D acoustic view contracts expose frequency and visibility operations', () => {
  const field = { sample: () => 1 };
  const base = new ScalarFieldView({ id: 'base-view', field });
  hasMethods(base, ['setField', 'setFrequency', 'setFrequencyRange', 'setAggregation', 'setRange', 'show', 'hide', 'destroy']);

  const plane = new SampledFieldPlane({ id: 'plane', field, bounds: { min: [0, 0, 0], max: [1, 0, 1] }, resolution: [2, 2] });
  const slices = new OrthogonalFieldSlices({ id: 'slices', field, bounds: { min: [0, 0, 0], max: [1, 1, 1] }, counts: { x: 1, y: 0, z: 0 }, resolution: { yz: [2, 2] } });
  assert.ok(plane instanceof ScalarFieldView);
  assert.ok(slices instanceof ScalarFieldView);

  const frequency = new FrequencyRangeController({ minHz: 20, maxHz: 100, selectedHz: 50, mode: 'single' });
  hasMethods(frequency, ['setMin', 'setMax', 'setRange', 'setSelectedFrequency', 'setMode', 'destroy']);
});

test('AcousticMate V1 model contracts are instantiable through public APIs', () => {
  const room = new RectangularRoom({ width: 6, height: 2.7, depth: 4.5 });
  const domain = AcousticDomain.fromRectangularRoom(room);
  assert.equal(domain.geometryType, 'rectangular');

  const directivity = new DirectivityModel({ mode: 'omni' });
  const model = new SpeakerModel({ id: 'generic/test', model: 'Test', type: 'point-source', directivity });
  const chain = new SignalChain({ processors: [new Gain({ id: 'gain', db: 0 })] });
  const speaker = new Speaker({ id: 'speaker', model, position: [1, .5, 1], signalChain: chain });
  hasMethods(speaker, ['setModel', 'setPosition', 'setOrientation', 'setEnabled', 'setSignalChain']);

  const set = new SpeakerSet({ id: 'set', type: 'generic' });
  set.addMember({ speaker });
  hasMethods(set, ['addMember', 'removeMember', 'setPosition', 'setOrientation', 'setMemberPosition', 'setMemberOrientation', 'setMemberGainTrim', 'setMemberDelayTrim', 'setMemberProcessing', 'moveMember', 'setEnabled', 'setSignalChain']);

  const routeChain = new SignalChain({ processors: [new Gain({ id: 'route-gain', db: 0 })] });
  const crossover = new CrossoverNetwork({ routes: [{ id: 'route', targets: [set], signalChain: routeChain }] });
  hasMethods(crossover, ['addRoute', 'removeRoute', 'assignSpeaker', 'assignSpeakerSet', 'unassignSpeaker', 'unassignSpeakerSet', 'setSignalChain', 'transferFor']);

  const modeSolver = new RoomModeSolver();
  hasMethods(modeSolver, ['strategyFor', 'solve']);
  const modes = modeSolver.solve(domain, [20, 100]);
  assert.ok(Array.isArray(modes));

  const coupling = new SpeakerModeCoupling({ dimensions: room.dimensions, crossoverNetwork: crossover });
  hasMethods(coupling, ['evaluate']);

  const combined = new CombinedAcousticField({ domain, modes, speakerSets: [set], frequencyRange: [20, 100], crossoverNetwork: crossover });
  hasMethods(combined, ['fieldAtFrequency', 'invalidate', 'setFrequencyRange', 'setSpeakers', 'setDomain']);

  const material = new AcousticMaterialProfile({ absorption: [[20, .5], [20000, .5]], normalizedConductance: [[20, .2], [20000, .8]] });
  hasMethods(material, ['absorptionAt', 'scatteringAt', 'normalizedConductanceAt']);
  assert.ok(material.normalizedConductanceAt(1000) > .2);
  const object = new AcousticObject({ id: 'absorber', type: 'absorber', geometry: new Box({ id: 'absorber-box' }), acousticModel: 'absorptive', materialProfile: material });
  hasMethods(object, ['setAttachment', 'setAcousticModel', 'setMaterialProfile', 'absorptionAt', 'scatteringAt', 'normalizedConductanceAt']);
});

test('RoomEditor prototype exposes contract transaction operations', () => {
  hasMethods(RoomEditor.prototype, ['setWidth', 'setDepth', 'setHeight', 'addOpening', 'updateOpening', 'removeOpening', 'open', 'commit', 'cancel']);
});
