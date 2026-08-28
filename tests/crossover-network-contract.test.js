import test from 'node:test';
import assert from 'node:assert/strict';
import { CrossoverNetwork } from '../src/crossover-network.js';
import { Speaker } from '../src/speaker.js';
import { SpeakerSet } from '../src/speaker-set.js';

const chain = response => ({ evaluateFrequencyResponse() { return [...response]; } });

test('SpeakerSet crossover routing applies dynamically to current member Speakers', () => {
  const network = new CrossoverNetwork();
  const set = new SpeakerSet({ id: 'subs', type: 'sub-array' });
  const first = new Speaker({ id: 'sub-1' });
  const second = new Speaker({ id: 'sub-2' });
  set.addMember({ speaker: first });

  const route = network.addRoute({ id: 'sub-route', signalChain: chain([.5, .25]) });
  network.assignSpeakerSet(route, set);
  assert.deepEqual(network.transferFor(first, 80), [.5, .25]);
  assert.deepEqual(network.transferFor(second, 80), [1, 0]);

  set.addMember({ speaker: second });
  assert.deepEqual(network.transferFor(second, 80), [.5, .25]);

  set.removeMember(first);
  assert.deepEqual(network.transferFor(first, 80), [1, 0]);
  assert.deepEqual(network.transferFor(second, 80), [.5, .25]);
});

test('unassigning a SpeakerSet route removes processing from all current members without changing member identity', () => {
  const network = new CrossoverNetwork();
  const speaker = new Speaker({ id: 'member' });
  const set = new SpeakerSet({ id: 'set', members: [{ speaker }] });
  const member = set.memberForSpeaker(speaker);
  const route = network.addRoute({ id: 'route', signalChain: chain([.25, 0]) });
  network.assignSpeakerSet(route, set);
  assert.deepEqual(network.transferFor(speaker, 100), [.25, 0]);

  network.unassignSpeakerSet(route, set);
  assert.deepEqual(network.transferFor(speaker, 100), [1, 0]);
  assert.equal(set.memberForSpeaker(speaker), member);
  assert.equal(member.speaker, speaker);
});
