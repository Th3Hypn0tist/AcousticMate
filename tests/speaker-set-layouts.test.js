import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeakerSet } from '../src/speaker-set.js';
import { alignMembers, distributeMembers, mirrorMembers } from '../src/speaker-set-layouts.js';

function speaker(id) {
  return {
    id,
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    setPosition(value) { this.position = [...value]; return this; },
    setOrientation(value) { this.orientation = [...value]; return this; },
  };
}

function setWithPositions(positions) {
  const set = new SpeakerSet({ id: 'set-layout-test' });
  positions.forEach((position, index) => set.addMember({ speaker: speaker(`speaker-${index + 1}`), localPosition: position }));
  return set;
}

test('mirrorMembers mirrors local coordinates around an arbitrary origin', () => {
  const set = setWithPositions([[1, 0, 0], [3, 0, 0]]);
  mirrorMembers(set, { axis: 'x', origin: 2 });
  assert.deepEqual(set.members.map(member => member.localPosition), [[3, 0, 0], [1, 0, 0]]);
});

test('alignMembers aligns members without changing the other coordinates', () => {
  const set = setWithPositions([[0, 1, 4], [2, 3, 6], [4, 5, 8]]);
  alignMembers(set, { axis: 'y', mode: 'center' });
  assert.deepEqual(set.members.map(member => member.localPosition), [[0, 3, 4], [2, 3, 6], [4, 3, 8]]);
});

test('distributeMembers preserves endpoints and spaces members equally', () => {
  const set = setWithPositions([[0, 0, 0], [9, 0, 0], [2, 0, 0], [6, 0, 0]]);
  distributeMembers(set, { axis: 'x' });
  const ordered = set.members.map(member => member.localPosition[0]).sort((a, b) => a - b);
  assert.deepEqual(ordered, [0, 3, 6, 9]);
});
