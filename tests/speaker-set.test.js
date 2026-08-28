import test from 'node:test';
import assert from 'node:assert/strict';
import { Speaker } from '../src/speaker.js';
import { SpeakerSet } from '../src/speaker-set.js';
import { applyClusterLayout, applyLineArrayLayout, applySubArrayLayout, mirrorMembers } from '../src/speaker-set-layouts.js';
import { eulerDegreesFromQuaternion, quaternionFromEulerDegrees } from '../src/spatial.js';

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('SpeakerSet composes parent and member-local positions', () => {
  const speaker = new Speaker({ id: 'a', position: [0, 0, 0] });
  const set = new SpeakerSet({ id: 'set', position: [2, 1, 3], members: [{ speaker, localPosition: [1, .5, -1] }] });
  assert.deepEqual(speaker.position, [3, 1.5, 2]);
  set.setPosition([4, 2, 1]);
  assert.deepEqual(speaker.position, [5, 2.5, 0]);
  assert.deepEqual(set.memberForSpeaker(speaker).localPosition, [1, .5, -1]);
});

test('moving a rotated SpeakerSet preserves member-local geometry', () => {
  const speaker = new Speaker({ id: 'a' });
  const set = new SpeakerSet({ id: 'set', orientation: quaternionFromEulerDegrees({ yaw: 90 }) });
  set.addMember({ speaker, localPosition: [0, 0, 1] });
  close(speaker.position[0], 1);
  close(speaker.position[2], 0);
  set.setPosition([2, 0, 3]);
  close(speaker.position[0], 3);
  close(speaker.position[2], 3);
});

test('line-array helper creates centered vertical spacing and progressive splay', () => {
  const members = [0, 1, 2].map(index => new Speaker({ id: `s${index}` }));
  const set = new SpeakerSet({ id: 'array', type: 'line-array', members: members.map(speaker => ({ speaker })) });
  applyLineArrayLayout(set, { spacing: .25, splayDeg: 5, arrayTiltDeg: 2 });
  assert.deepEqual(set.members.map(member => member.localPosition), [[0, .25, 0], [0, 0, 0], [0, -.25, 0]]);
  const pitches = set.members.map(member => eulerDegreesFromQuaternion(member.localOrientation).pitch);
  close(pitches[0], -3, 1e-7);
  close(pitches[1], 2, 1e-7);
  close(pitches[2], 7, 1e-7);
});

test('sub-array helper creates a straight centered row when arc is zero', () => {
  const members = [0, 1, 2, 3].map(index => new Speaker({ id: `sub${index}` }));
  const set = new SpeakerSet({ id: 'subs', type: 'sub-array', members: members.map(speaker => ({ speaker })) });
  applySubArrayLayout(set, { spacing: .8, arcDeg: 0 });
  const expected = [-1.2, -.4, .4, 1.2];
  set.members.forEach((member, index) => {
    close(member.localPosition[0], expected[index]);
    close(member.localPosition[1], 0);
    close(member.localPosition[2], 0);
  });
});

test('cluster helper fans members around the set forward axis', () => {
  const members = [0, 1, 2].map(index => new Speaker({ id: `c${index}` }));
  const set = new SpeakerSet({ id: 'cluster', type: 'cluster', members: members.map(speaker => ({ speaker })) });
  applyClusterLayout(set, { radius: 1, spreadDeg: 60 });
  close(set.members[1].localPosition[0], 0);
  close(set.members[1].localPosition[2], 0);
  const yaws = set.members.map(member => eulerDegreesFromQuaternion(member.localOrientation).yaw);
  close(yaws[0], -30, 1e-7);
  close(yaws[1], 0, 1e-7);
  close(yaws[2], 30, 1e-7);
});

test('layout helpers preserve Speaker, member and processing identity', () => {
  const speakers = [0, 1, 2].map(index => new Speaker({ id: `identity-${index}` }));
  const set = new SpeakerSet({
    id: 'identity-set',
    type: 'line-array',
    members: speakers.map((speaker, index) => ({ speaker, gainTrimDb: index - 1, delayTrimMs: index * .5 })),
  });
  const members = [...set.members];
  const processing = members.map(member => [member.gainTrimDb, member.delayTrimMs]);

  applyLineArrayLayout(set, { spacing: .3, splayDeg: 4, arrayTiltDeg: -2 });
  mirrorMembers(set, { axis: 'x' });

  assert.deepEqual(set.members, members);
  set.members.forEach((member, index) => {
    assert.equal(member, members[index]);
    assert.equal(member.speaker, speakers[index]);
    assert.equal(member.speaker.parentSet, set);
    assert.deepEqual([member.gainTrimDb, member.delayTrimMs], processing[index]);
  });
});
