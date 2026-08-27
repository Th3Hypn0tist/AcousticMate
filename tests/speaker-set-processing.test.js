import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeakerSet } from '../src/speaker-set.js';

function speaker(id) {
  return {
    id,
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    setPosition(value) { this.position = [...value]; return this; },
    setOrientation(value) { this.orientation = [...value]; return this; },
  };
}

test('SpeakerSet member processing trims have explicit setter API and event', () => {
  const set = new SpeakerSet({ id: 'sub-array', type: 'sub-array' });
  const memberSpeaker = speaker('sub-1');
  set.addMember({ speaker: memberSpeaker });
  let changed = null;
  set.on('memberProcessingChanged', event => { changed = event; });
  set.setMemberProcessing(memberSpeaker, { gainTrimDb: -3, delayTrimMs: 2.5 });
  const member = set.memberForSpeaker(memberSpeaker);
  assert.equal(member.gainTrimDb, -3);
  assert.equal(member.delayTrimMs, 2.5);
  assert.equal(changed.member, member);
});

test('SpeakerSet member trims alter transfer without changing speaker identity', () => {
  const set = new SpeakerSet({ id: 'sub-array', type: 'sub-array' });
  const memberSpeaker = speaker('sub-1');
  set.addMember({ speaker: memberSpeaker });
  const before = set.transferForSpeaker(memberSpeaker, 100, [1, 0]);
  set.setMemberGainTrim(memberSpeaker, -6.020599913279624);
  set.setMemberDelayTrim(memberSpeaker, 2.5);
  const after = set.transferForSpeaker(memberSpeaker, 100, [1, 0]);
  assert.equal(set.memberForSpeaker(memberSpeaker).speaker, memberSpeaker);
  assert.ok(Math.hypot(...after) < Math.hypot(...before));
});

test('SpeakerSet moveMember changes element order without changing member identity', () => {
  const set = new SpeakerSet({ id: 'line-array', type: 'line-array' });
  const a = speaker('a');
  const b = speaker('b');
  const c = speaker('c');
  const memberA = set.addMember({ speaker: a });
  const memberB = set.addMember({ speaker: b });
  const memberC = set.addMember({ speaker: c });
  let event = null;
  set.on('memberOrderChanged', value => { event = value; });
  set.moveMember(memberC, 0);
  assert.deepEqual(set.members.map(member => member.speaker.id), ['c', 'a', 'b']);
  assert.equal(set.members[0], memberC);
  assert.equal(set.members[1], memberA);
  assert.equal(set.members[2], memberB);
  assert.equal(event.fromIndex, 2);
  assert.equal(event.toIndex, 0);
});
