import test from 'node:test';
import assert from 'node:assert/strict';
import { Speaker } from '../src/speaker.js';
import { SpeakerSet } from '../src/speaker-set.js';
import { SpeakerSetEditorState } from '../src/speaker-set-editor-state.js';

function setWithMembers(type, count) {
  const set = new SpeakerSet({ id: `${type}-set`, type });
  for (let index = 0; index < count; index += 1) set.addMember(new Speaker({ id: `${type}-${index}` }));
  return set;
}

test('helper values survive editor rerenders without touching domain metadata', () => {
  const set = setWithMembers('line-array', 4);
  const state = new SpeakerSetEditorState(set);
  state.setValue('spacing', .42).setValue('splay', 7.5).setValue('tilt', -3);

  const first = state.snapshot();
  const second = state.snapshot();
  assert.deepEqual(second, first);
  assert.equal(second.values.spacing, .42);
  assert.equal(second.values.splay, 7.5);
  assert.equal(second.values.tilt, -3);
  assert.deepEqual(set.metadata, {});
});

test('untouched helper count follows structural member changes', () => {
  const set = setWithMembers('sub-array', 2);
  const state = new SpeakerSetEditorState(set);
  set.addMember(new Speaker({ id: 'sub-array-extra' }));
  state.syncMemberCount();
  assert.equal(state.values.count, 3);
});

test('manually edited helper count survives unrelated rerenders', () => {
  const set = setWithMembers('line-array', 4);
  const state = new SpeakerSetEditorState(set);
  state.setValue('count', 8);
  set.addMember(new Speaker({ id: 'line-array-extra' }));
  state.syncMemberCount();
  assert.equal(state.values.count, 8);
});

test('applied helper count resynchronizes to realized member count', () => {
  const set = setWithMembers('line-array', 4);
  const state = new SpeakerSetEditorState(set);
  state.setValue('count', 6);
  set.addMember(new Speaker({ id: 'line-array-4' }));
  set.addMember(new Speaker({ id: 'line-array-5' }));
  state.applied();
  assert.equal(state.values.count, 6);
  assert.equal(state.touched.has('count'), false);
});

test('helper state is isolated between SpeakerSets', () => {
  const a = new SpeakerSetEditorState(setWithMembers('cluster', 2));
  const b = new SpeakerSetEditorState(setWithMembers('cluster', 2));
  a.setValue('radius', 1.2);
  assert.equal(a.values.radius, 1.2);
  assert.equal(b.values.radius, .35);
});
