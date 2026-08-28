import { viewportForCanvas } from '../vendor/S3D/s3d.js';

function syncSetEditorSpeakerDirections(scene, root = document) {
  const setEditorVisible = root.querySelector('.set-editor-panel')?.hidden === false;
  for (const node of scene?.objects?.values?.() ?? []) {
    const speaker = node?.model;
    const set = speaker?.parentSet;
    if (!set || typeof node.setDirectionOrientation !== 'function') continue;
    if (!setEditorVisible || node.visible === false) {
      node.setDirectionOrientation(null);
      continue;
    }
    const member = set.memberForSpeaker?.(speaker);
    node.setDirectionOrientation(member?.localOrientation ?? null);
  }
}

function installSetEditorPreviewRuntime(root = document) {
  const canvas = root.querySelector('canvas[data-role="viewport"]');
  if (!canvas) throw new Error('Set Editor preview runtime requires the AcousticMate viewport canvas');
  const viewport = viewportForCanvas(canvas);
  if (!viewport?.scene) throw new Error('Set Editor preview runtime requires an initialized S3D viewport');
  const scene = viewport.scene;
  const updater = {
    id: 'set-editor-preview-runtime',
    visible: false,
    update() { syncSetEditorSpeakerDirections(scene, root); },
  };
  scene.add(updater);
  syncSetEditorSpeakerDirections(scene, root);
  return {
    destroy() {
      scene.remove(updater);
      for (const node of scene?.objects?.values?.() ?? []) {
        if (typeof node?.setDirectionOrientation === 'function') node.setDirectionOrientation(null);
      }
    },
  };
}

export { installSetEditorPreviewRuntime, syncSetEditorSpeakerDirections };
