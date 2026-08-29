import test from 'node:test';
import assert from 'node:assert/strict';
import { CombinedAcousticField } from '../src/combined-acoustic-field.js';
import { acousticObjectInverseQ, RectangularRoomField } from '../src/rectangular-room-field.js';
import { RoomEditor } from '../src/room-editor.js';

const dimensions = { width: 4, height: 2.5, depth: 3 };
const mode = { nx: 1, ny: 0, nz: 0, frequency: 343 / (2 * dimensions.width) };

function attachedObject({ acousticModel = 'absorptive', offset = 0, width = .4, coefficient = 1 } = {}) {
  return {
    acousticModel,
    attachment: { wall: 'z-min', offset, width, height: dimensions.height, sillHeight: 0 },
    absorptionAt: () => acousticModel === 'absorptive' ? coefficient : 0,
    normalizedConductanceAt: () => acousticModel === 'impedance' ? coefficient : 0,
  };
}

function domain(acousticObjects = []) {
  return {
    dimensions: { ...dimensions },
    bounds: { min: [0, 0, 0], max: [dimensions.width, dimensions.height, dimensions.depth] },
    acousticObjects,
    openings: () => [],
  };
}

test('attached absorptive treatment reduces a modal antinode response', () => {
  const speaker = { position: [0, 1, 0], enabled: true };
  const untreated = new RectangularRoomField({ dimensions, modes: [mode], frequency: mode.frequency, speakers: [speaker], q: 18 });
  const treated = new RectangularRoomField({ dimensions, modes: [mode], frequency: mode.frequency, speakers: [speaker], q: 18, acousticObjects: [attachedObject()] });

  const before = untreated.sample(0, 1, 0);
  const after = treated.sample(0, 1, 0);
  assert.ok(after < before, `expected treatment to reduce modal response: ${after} < ${before}`);

  const prepared = treated.prepareModesAt(mode.frequency)[0];
  assert.ok(prepared.treatmentInverseQ > 0);
  assert.ok(prepared.inverseQ > 1 / 18);
});

test('the same boundary treatment produces less damping over a modal node than an antinode', () => {
  const antinode = attachedObject({ offset: 0, width: .4 });
  const node = attachedObject({ offset: dimensions.width / 2 - .2, width: .4 });
  const antinodeLoss = acousticObjectInverseQ(mode, [antinode], dimensions);
  const nodeLoss = acousticObjectInverseQ(mode, [node], dimensions);
  assert.ok(antinodeLoss > nodeLoss, `expected antinode loss ${antinodeLoss} to exceed node loss ${nodeLoss}`);
});

test('impedance treatment consumes explicit normalized conductance without semantic type inference', () => {
  const impedance = attachedObject({ acousticModel: 'impedance', coefficient: .65 });
  const loss = acousticObjectInverseQ(mode, [impedance], dimensions);
  assert.ok(loss > 0);

  const samePhysicsWithNoSemanticType = { ...impedance, type: 'custom' };
  assert.equal(acousticObjectInverseQ(mode, [samePhysicsWithNoSemanticType], dimensions), loss);
});

test('free-standing treatment remains zero rectangular boundary loss', () => {
  const freeStanding = {
    acousticModel: 'impedance',
    attachment: null,
    absorptionAt: () => 1,
    normalizedConductanceAt: () => 1,
  };
  assert.equal(acousticObjectInverseQ(mode, [freeStanding], dimensions), 0);
});

test('wall treatment does not attenuate the direct field', () => {
  const speaker = { position: [1, 1, 1], enabled: true, transferAt: () => [1, 0] };
  const combined = new CombinedAcousticField({ domain: domain(), modes: [mode], speakers: [speaker], frequencyRange: [20, 100] });
  const before = combined.directField.sampleComplexAtFrequency(2, 1, 1, 80);
  combined.setDomain(domain([attachedObject({ acousticModel: 'impedance', coefficient: 1 })]));
  const after = combined.directField.sampleComplexAtFrequency(2, 1, 1, 80);
  assert.deepEqual(after, before);
});

test('RoomEditor creates bass traps as explicit idealized impedance objects', () => {
  const context = {
    objectSequence: 0,
    room: {
      dimensions: { ...dimensions },
      wallSpan: () => dimensions.width,
      addAcousticObject: object => object,
    },
    scene: { add() {}, remove() {} },
    createAcousticGeometry: RoomEditor.prototype.createAcousticGeometry,
    treatmentProfile: RoomEditor.prototype.treatmentProfile,
  };
  const object = RoomEditor.prototype.addAcousticObject.call(context, 'bass-trap', 'box');
  assert.equal(object.type, 'bass-trap');
  assert.equal(object.acousticModel, 'impedance');
  assert.equal(object.metadata.acousticProfileSource, 'idealized-generic');
  assert.equal(object.normalizedConductanceAt(80), .65);
  assert.equal(object.absorptionAt(80), 0);
});
