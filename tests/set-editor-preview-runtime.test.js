import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeakerNode } from '../vendor/S3D/domains/acoustics/speaker-node.js';
import { syncSetEditorSpeakerDirections } from '../src/set-editor-preview-runtime.js';

function rootWithSetEditor(hidden) {
  return { querySelector(selector) { return selector === '.set-editor-panel' ? { hidden } : null; } };
}

test('Set Editor direction preview uses member-local orientation only while visible', () => {
  const localOrientation = [0, 0, 0, 1];
  const worldOrientation = [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)];
  const speaker = { id: 'member', orientation: worldOrientation, parentSet: null };
  const member = { speaker, localOrientation };
  const set = { memberForSpeaker(value) { return value === speaker ? member : null; } };
  speaker.parentSet = set;
  const node = new SpeakerNode({ id: 'member-node', visible: true });
  node.model = speaker;
  const scene = { objects: new Map([[node.id, node]]) };

  syncSetEditorSpeakerDirections(scene, rootWithSetEditor(false));
  assert.equal(node.directionOrientation, null);
  const worldDirection = node.effectiveDirection();
  assert.ok(Math.abs(worldDirection[0] - 1) < 1e-9);

  syncSetEditorSpeakerDirections(scene, rootWithSetEditor(true));
  assert.deepEqual(node.directionOrientation, localOrientation);
  assert.deepEqual(node.effectiveDirection(), [0, 0, 1]);

  node.visible = false;
  syncSetEditorSpeakerDirections(scene, rootWithSetEditor(true));
  assert.equal(node.directionOrientation, null);
});
