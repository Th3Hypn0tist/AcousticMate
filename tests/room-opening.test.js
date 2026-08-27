import test from 'node:test';
import assert from 'node:assert/strict';
import { RectangularRoom, RoomOpening } from '../src/room.js';
import { RectangularRoomField, openingInverseQ, openingModeEffectiveArea } from '../src/rectangular-room-field.js';

test('room openings stay inside their owning wall', () => {
  const room = new RectangularRoom({ width: 6, height: 2.7, depth: 4.5 });
  const door = room.addOpening(new RoomOpening({ id: 'door', wall: 'z-min', offset: 1, width: .9, height: 2.1 }));
  assert.equal(room.openings.length, 1);
  assert.throws(() => room.updateOpening(door, { offset: 5.5 }), /exceeds/);
  assert.equal(door.offset, 1);
});

test('an open boundary adds mode-dependent inverse Q without exterior geometry', () => {
  const dimensions = { width: 6, height: 2.7, depth: 4.5 };
  const opening = new RoomOpening({ id: 'door', wall: 'z-min', offset: 2.55, width: .9, height: 2.1 });
  const mode = { nx: 1, ny: 0, nz: 0, frequency: 343 / 12 };
  assert.ok(openingModeEffectiveArea(mode, opening, dimensions) > 0);
  assert.ok(openingInverseQ(mode, [opening], dimensions) > 0);
  assert.equal(openingInverseQ(mode, [], dimensions), 0);
});

test('RectangularRoomField exposes opening leakage separately from base damping', () => {
  const dimensions = { width: 6, height: 2.7, depth: 4.5 };
  const speakers = [{ position: [1, 1, 1], enabled: true, transferAt: () => [1, 0] }];
  const closed = new RectangularRoomField({ dimensions, speakers, frequency: 58, maxFrequency: 80, q: 18 });
  const open = new RectangularRoomField({
    dimensions,
    speakers,
    frequency: 58,
    maxFrequency: 80,
    q: 18,
    openings: [new RoomOpening({ id: 'door', wall: 'z-min', offset: 2.55, width: .9, height: 2.1 })],
  });
  const closedMode = closed.prepareModes().find(item => item.mode.nx === 2 && item.mode.ny === 0 && item.mode.nz === 0);
  const openMode = open.prepareModes().find(item => item.mode.nx === 2 && item.mode.ny === 0 && item.mode.nz === 0);
  assert.equal(closedMode.openingInverseQ, 0);
  assert.ok(openMode.openingInverseQ > 0);
  assert.ok(openMode.inverseQ > closedMode.inverseQ);
});
