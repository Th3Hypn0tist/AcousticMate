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
