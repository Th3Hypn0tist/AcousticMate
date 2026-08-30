import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

test('main app uses AcousticRuntime instead of owning analytical solver wiring', () => {
  assert.match(mainSource, /import\s+\{\s*AcousticRuntime\s*\}\s+from\s+'\.\/acoustic-runtime\.js'/);
  assert.match(mainSource, /new\s+AcousticRuntime\s*\(/);
  assert.doesNotMatch(mainSource, /import\s+\{\s*RectangularRoomField\s*\}/);
  assert.doesNotMatch(mainSource, /AggregatedFrequencyField/);
});

test('main field views consume the combined phase-aware frequency field', () => {
  assert.match(mainSource, /const\s+frequencyField\s*=\s*acousticRuntime\.frequencyField/);
  assert.match(mainSource, /field:\s*frequencyField/);
  assert.match(mainSource, /setFrequencyRange\(/);
  assert.match(mainSource, /setAggregation\(/);
});

test('main app uses one S3D TransformGizmoController instead of PlaneDragController', () => {
  assert.match(mainSource, /TransformGizmoController/);
  assert.match(mainSource, /new\s+TransformGizmoController\s*\(/);
  assert.doesNotMatch(mainSource, /PlaneDragController/);
  assert.match(mainSource, /const\s+transformGizmo\s*=\s*new\s+TransformGizmoController/);
});

test('shared gizmo candidate routing covers standalone speakers sets set members and room treatments', () => {
  assert.match(mainSource, /if\s*\(editorState\.room\)\s*return\s*roomEditor\?\.acousticObjectGizmoCandidates/);
  assert.match(mainSource, /if\s*\(editorState\.set\)\s*return\s*editorState\.set\.members\.map/);
  assert.match(mainSource, /speakerNodes\.filter\(node\s*=>\s*!node\.model\?\.parentSet\)/);
  assert.match(mainSource, /\.\.\.setNodes/);
});

test('global Gizmos toggle gates the shared transform controller', () => {
  assert.match(mainSource, /let\s+gizmosEnabled\s*=\s*true/);
  assert.match(mainSource, /gui\.field\('Gizmos'/);
  assert.match(mainSource, /transformGizmo\.setEnabled\(gizmosEnabled\)/);
});

test('speaker and SpeakerSet gizmo rotation writes model orientation', () => {
  assert.match(mainSource, /wireSpeakerNodeGizmo/);
  assert.match(mainSource, /speaker\.setOrientation\(orientation\)/);
  assert.match(mainSource, /editedSet\.setMemberOrientation\(speaker,\s*orientation\)/);
  assert.match(mainSource, /wireSpeakerSetGizmo/);
  assert.match(mainSource, /set\.setOrientation\(orientationFromGizmoRotation\(value\)\)/);
});
