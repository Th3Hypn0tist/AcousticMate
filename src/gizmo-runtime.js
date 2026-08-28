import { TransformGizmoController, viewportForCanvas } from '../vendor/S3D/s3d.js';
import { eulerDegreesFromQuaternion, quaternionFromEulerDegrees } from './spatial.js';

const toRadians = degrees => Number(degrees) * Math.PI / 180;
const toDegrees = radians => Number(radians) * 180 / Math.PI;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function quaternionToEulerRadians(value) {
  const { yaw, pitch, roll } = eulerDegreesFromQuaternion(value);
  return [toRadians(pitch), toRadians(yaw), toRadians(roll)];
}

function eulerRadiansToQuaternion(value) {
  return quaternionFromEulerDegrees({ pitch: toDegrees(value[0]), yaw: toDegrees(value[1]), roll: toDegrees(value[2]) });
}

function attachmentForWorldPosition(object, room, position) {
  if (!object?.attachment || !room?.dimensions) return null;
  const attachment = object.attachment;
  const span = room.wallSpan(attachment.wall);
  const alongCenter = attachment.wall.startsWith('x-') ? Number(position[2]) : Number(position[0]);
  const offset = clamp(alongCenter - attachment.width / 2, 0, Math.max(0, span - attachment.width));
  const sillHeight = clamp(Number(position[1]) - attachment.height / 2, 0, Math.max(0, room.dimensions.height - attachment.height));
  return { ...attachment, offset, sillHeight };
}

function treatmentCandidate(geometry) {
  const object = geometry?.acousticObject;
  const room = object?.room;
  if (!object || !room) return null;
  geometry.selectable = true;
  geometry.gizmoEnabled = true;
  geometry.draggable = false;
  geometry.gizmoPickRadius = Math.max(.24, Math.hypot(...(geometry.scale ?? [.2, .2, .2])));
  geometry.gizmoGetPosition = () => [...geometry.position];
  geometry.gizmoSetPosition = position => {
    const attachment = attachmentForWorldPosition(object, room, position);
    if (attachment) room.updateAcousticObject(object, { attachment });
    else geometry.setPosition(position);
    return geometry;
  };
  geometry.gizmoGetRotation = () => [...(object.metadata?.presentationRotation ?? geometry.rotation ?? [0, 0, 0])];
  geometry.gizmoSetRotation = rotation => object.setPresentationRotation(rotation);
  return geometry;
}

function modelCandidate(node, { setEditorVisible = false } = {}) {
  const model = node?.model;
  if (!model || typeof model.setPosition !== 'function' || typeof model.setOrientation !== 'function') return null;
  if (model.parentSet && !setEditorVisible) return null;
  node.draggable = false;
  node.selectable = true;
  node.gizmoEnabled = true;
  node.gizmoGetRotation = () => {
    if (model.parentSet && setEditorVisible) {
      const member = model.parentSet.memberForSpeaker?.(model);
      if (member?.localOrientation) return quaternionToEulerRadians(member.localOrientation);
    }
    return quaternionToEulerRadians(model.orientation);
  };
  node.gizmoSetRotation = rotation => {
    const orientation = eulerRadiansToQuaternion(rotation);
    if (model.parentSet && setEditorVisible) model.parentSet.setMemberOrientation(model, orientation);
    else model.setOrientation(orientation);
    node.setRotation?.(rotation, { emit: false });
    return node;
  };
  return node;
}

function manipulationCandidates(scene, root = document) {
  const setEditorVisible = root.querySelector('.set-editor-panel')?.hidden === false;
  const result = [];
  for (const object of scene?.objects?.values?.() ?? []) {
    const treatment = treatmentCandidate(object);
    if (treatment) { result.push(treatment); continue; }
    const model = modelCandidate(object, { setEditorVisible });
    if (model) result.push(model);
  }
  return result;
}

function installGizmoRuntime(root = document) {
  const canvas = root.querySelector('canvas[data-role="viewport"]');
  if (!canvas) throw new Error('Gizmo runtime requires the AcousticMate viewport canvas');
  const viewport = viewportForCanvas(canvas);
  if (!viewport?.scene || !viewport.camera) throw new Error('Gizmo runtime requires an initialized S3D viewport');

  const disableDirectDragging = () => {
    for (const candidate of manipulationCandidates(viewport.scene, root)) candidate.draggable = false;
  };
  disableDirectDragging();
  canvas.addEventListener('pointerdown', disableDirectDragging, true);

  const controller = new TransformGizmoController(canvas, viewport.camera, viewport.scene, {
    candidates: () => manipulationCandidates(viewport.scene, root),
    enabled: false,
    mode: 'position',
    onSelectionChanged: updateStatus,
    onModeChanged: updateStatus,
  });

  const sidebar = root.querySelector('.sidebar');
  const row = document.createElement('div');
  row.className = 'gizmo-controls button-row';
  const label = document.createElement('label');
  label.className = 'check-field';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.dataset.role = 'gizmo-enable';
  const status = document.createElement('span');
  status.className = 'coordinates';
  status.dataset.role = 'gizmo-status';
  label.append(checkbox, document.createTextNode(' Gizmos'));
  row.append(label, status);
  sidebar?.prepend(row);

  function updateStatus() {
    const selected = controller.selected;
    status.textContent = controller.enabled ? `${controller.mode === 'rotate' ? 'Rotate' : 'Position'}${selected ? ` · ${selected.model?.name ?? selected.acousticObject?.id ?? selected.id}` : ''}` : 'Off';
    canvas.dataset.gizmos = controller.enabled ? 'on' : 'off';
    canvas.dataset.gizmoMode = controller.mode;
  }

  checkbox.addEventListener('change', () => {
    controller.setEnabled(checkbox.checked);
    disableDirectDragging();
    updateStatus();
  });

  const destroyController = controller.destroy.bind(controller);
  controller.destroy = () => {
    canvas.removeEventListener('pointerdown', disableDirectDragging, true);
    row.remove();
    destroyController();
  };

  updateStatus();
  return controller;
}

export {
  attachmentForWorldPosition,
  eulerRadiansToQuaternion,
  installGizmoRuntime,
  manipulationCandidates,
  quaternionToEulerRadians,
};
