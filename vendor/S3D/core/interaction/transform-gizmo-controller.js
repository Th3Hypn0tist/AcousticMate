import { distanceFromRay, intersectPlane } from './plane-drag-controller.js';

const AXIS_COLORS = Object.freeze({
  x: [1, .28, .28],
  y: [.35, 1, .35],
  z: [.35, .55, 1],
});
const AXIS_VECTORS = Object.freeze({
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
});
const AXIS_INDEX = Object.freeze({ x: 0, y: 1, z: 2 });

function candidatePosition(candidate) {
  if (typeof candidate?.gizmoGetPosition === 'function') return candidate.gizmoGetPosition();
  return candidate?.worldPosition?.() ?? candidate?.position ?? null;
}

function candidateRotation(candidate) {
  if (typeof candidate?.gizmoGetRotation === 'function') return candidate.gizmoGetRotation();
  return candidate?.rotation ?? [0, 0, 0];
}

function setCandidatePosition(candidate, value) {
  if (typeof candidate?.gizmoSetPosition === 'function') return candidate.gizmoSetPosition(value);
  if (typeof candidate?.setPosition === 'function') return candidate.setPosition(value);
  candidate.position = [...value];
  return candidate;
}

function setCandidateRotation(candidate, value) {
  if (typeof candidate?.gizmoSetRotation === 'function') return candidate.gizmoSetRotation(value);
  if (typeof candidate?.setRotation === 'function') return candidate.setRotation(value);
  candidate.rotation = [...value];
  return candidate;
}

function radiusFor(candidate, fallback) {
  const explicit = Number(candidate?.gizmoPickRadius ?? candidate?.dragRadius);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const scale = candidate?.scale;
  if (Array.isArray(scale) && scale.length === 3) return Math.max(fallback, Math.hypot(...scale));
  return fallback;
}

function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function subtract(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function pointOnAxis(origin, axis, distance) { return [origin[0] + axis[0] * distance, origin[1] + axis[1] * distance, origin[2] + axis[2] * distance]; }

function closestRayAxisParameter(ray, origin, axis) {
  const direction = ray?.direction;
  if (!Array.isArray(direction) || direction.length !== 3) return null;
  const w = subtract(ray.origin, origin);
  const dd = dot(direction, direction);
  const da = dot(direction, axis);
  const aa = dot(axis, axis);
  const dw = dot(direction, w);
  const aw = dot(axis, w);
  const denominator = dd * aa - da * da;
  if (Math.abs(denominator) <= 1e-10) return null;
  return (dd * aw - da * dw) / denominator;
}

function positionHandleHit(ray, center, size, tolerance = null) {
  const radius = tolerance ?? Math.max(.07, size * .14);
  let best = null;
  for (const [handle, axis] of Object.entries(AXIS_VECTORS)) {
    const raw = closestRayAxisParameter(ray, center, axis);
    if (raw == null) continue;
    const distance = Math.max(size * .18, Math.min(size * 1.12, raw));
    const point = pointOnAxis(center, axis, distance);
    const hit = distanceFromRay(ray, point);
    if (hit.along < 0 || hit.distance > radius) continue;
    if (!best || hit.distance < best.distance || (Math.abs(hit.distance - best.distance) < 1e-9 && hit.along < best.along)) best = { handle, ...hit };
  }
  return best;
}

function ringPoint(center, axis, radius, angle) {
  const c = Math.cos(angle) * radius;
  const s = Math.sin(angle) * radius;
  if (axis === 'x') return [center[0], center[1] + c, center[2] + s];
  if (axis === 'y') return [center[0] + c, center[1], center[2] + s];
  return [center[0] + c, center[1] + s, center[2]];
}

function rotationRingRadius(axis, size) {
  if (axis === 'x') return size * .72;
  if (axis === 'y') return size * .82;
  return size * .92;
}

function rotationHandleHit(ray, center, size, tolerance = null, segments = 72) {
  const radius = tolerance ?? Math.max(.065, size * .11);
  let best = null;
  for (const handle of Object.keys(AXIS_VECTORS)) {
    const ringRadius = rotationRingRadius(handle, size);
    for (let index = 0; index < segments; index++) {
      const point = ringPoint(center, handle, ringRadius, index * Math.PI * 2 / segments);
      const hit = distanceFromRay(ray, point);
      if (hit.along < 0 || hit.distance > radius) continue;
      if (!best || hit.distance < best.distance || (Math.abs(hit.distance - best.distance) < 1e-9 && hit.along < best.along)) best = { handle, ...hit };
    }
  }
  return best;
}

function intersectAxisPlane(ray, center, axis) {
  const normal = AXIS_VECTORS[axis];
  const denominator = dot(ray.direction, normal);
  if (Math.abs(denominator) <= 1e-9) return null;
  const distance = dot(subtract(center, ray.origin), normal) / denominator;
  if (distance < 0) return null;
  return [
    ray.origin[0] + ray.direction[0] * distance,
    ray.origin[1] + ray.direction[1] * distance,
    ray.origin[2] + ray.direction[2] * distance,
  ];
}

function ringPointerAngle(ray, center, axis) {
  const point = intersectAxisPlane(ray, center, axis);
  if (!point) return null;
  const value = subtract(point, center);
  if (axis === 'x') return Math.atan2(value[2], value[1]);
  if (axis === 'y') return Math.atan2(value[2], value[0]);
  return Math.atan2(value[1], value[0]);
}

function wrappedRadians(value) {
  let result = Number(value);
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function drawCircle(renderer, center, axis, radius, color, segments = 48) {
  let previous = ringPoint(center, axis, radius, 0);
  for (let index = 1; index <= segments; index++) {
    const next = ringPoint(center, axis, radius, index * Math.PI * 2 / segments);
    renderer?.line?.(previous, next, color);
    previous = next;
  }
}

class TransformGizmoController {
  constructor(canvas, camera, scene, {
    candidates = () => [],
    enabled = false,
    mode = 'position',
    pickRadius = .35,
    gizmoSize = .65,
    rotationSpeed = .012,
    vertical = true,
    onSelectionChanged = null,
    onModeChanged = null,
    onTransform = null,
  } = {}) {
    if (!canvas || !camera || !scene) throw new Error('TransformGizmoController requires canvas, camera and scene');
    this.canvas = canvas;
    this.camera = camera;
    this.scene = scene;
    this.candidates = candidates;
    this.enabled = Boolean(enabled);
    this.mode = mode === 'rotate' ? 'rotate' : 'position';
    this.pickRadius = Number(pickRadius);
    this.gizmoSize = Number(gizmoSize);
    this.rotationSpeed = Number(rotationSpeed);
    this.vertical = Boolean(vertical);
    this.onSelectionChanged = onSelectionChanged;
    this.onModeChanged = onModeChanged;
    this.onTransform = onTransform;
    this.selected = null;
    this.pointer = null;
    this.removeLayer = scene.addLayer((renderer) => this.draw(renderer));

    this.onPointerDown = event => {
      if (!this.enabled || event.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      const ray = camera.ray(event.clientX, event.clientY, rect);
      const handleHit = this.pickHandle(ray);
      const hit = handleHit ?? this.pick(ray);
      if (!hit) return;
      const alreadySelected = this.selected === hit.candidate;
      if (!alreadySelected) this.select(hit.candidate, { mode: 'position' });
      const position = candidatePosition(hit.candidate);
      const planePoint = intersectPlane(ray, position[1]);
      const handle = alreadySelected ? hit.handle ?? null : null;
      this.pointer = {
        id: event.pointerId,
        candidate: hit.candidate,
        handle,
        alreadySelected,
        moved: false,
        startX: event.clientX,
        startY: event.clientY,
        startPosition: [...position],
        startRotation: [...candidateRotation(hit.candidate)],
        startAxisParameter: handle && this.mode === 'position' ? closestRayAxisParameter(ray, position, AXIS_VECTORS[handle]) : null,
        startRingAngle: handle && this.mode === 'rotate' ? ringPointerAngle(ray, position, handle) : null,
        planeY: position[1],
        offset: planePoint ? [position[0] - planePoint[0], 0, position[2] - planePoint[2]] : [0, 0, 0],
        along: Math.max(hit.along, .001),
      };
      canvas.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    };

    this.onPointerMove = event => {
      if (!this.pointer || event.pointerId !== this.pointer.id) return;
      const dx = event.clientX - this.pointer.startX;
      const dy = event.clientY - this.pointer.startY;
      if (!this.pointer.moved && Math.hypot(dx, dy) < 3) return;
      this.pointer.moved = true;
      if (this.mode === 'rotate') {
        if (this.pointer.handle) this.rotatePointerHandle(event, dx, dy);
        else this.rotatePointer(dx, dy, event.shiftKey);
      } else if (this.pointer.handle) this.positionPointerHandle(event);
      else this.positionPointer(event, dy, event.shiftKey);
      event.preventDefault();
    };

    this.onPointerUp = event => {
      if (!this.pointer || event.pointerId !== this.pointer.id) return;
      const pointer = this.pointer;
      this.pointer = null;
      if (!pointer.moved && pointer.alreadySelected && !pointer.handle) this.toggleMode();
      if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      event.preventDefault();
    };

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (!this.enabled) {
      const pointerId = this.pointer?.id;
      this.pointer = null;
      if (pointerId != null && this.canvas.hasPointerCapture?.(pointerId)) this.canvas.releasePointerCapture(pointerId);
      this.select(null);
    }
    return this;
  }

  setMode(value) {
    const next = value === 'rotate' ? 'rotate' : 'position';
    if (this.mode === next) return this;
    this.mode = next;
    this.onModeChanged?.({ mode: this.mode, selected: this.selected });
    return this;
  }

  toggleMode() { return this.setMode(this.mode === 'position' ? 'rotate' : 'position'); }

  select(candidate, { mode = null } = {}) {
    if (candidate === this.selected && mode == null) return this;
    this.selected = candidate ?? null;
    if (mode) this.mode = mode === 'rotate' ? 'rotate' : 'position';
    this.onSelectionChanged?.({ selected: this.selected, mode: this.mode });
    this.onModeChanged?.({ mode: this.mode, selected: this.selected });
    return this;
  }

  pickHandle(ray) {
    if (!this.selected || this.selected.visible === false) return null;
    const center = candidatePosition(this.selected);
    if (!center) return null;
    const size = Math.max(.05, this.gizmoSize);
    const hit = this.mode === 'rotate' ? rotationHandleHit(ray, center, size) : positionHandleHit(ray, center, size);
    return hit ? { candidate: this.selected, ...hit } : null;
  }

  pick(ray) {
    let best = null;
    for (const candidate of this.candidates?.() ?? []) {
      if (!candidate || candidate.visible === false || candidate.selectable === false || candidate.gizmoEnabled === false) continue;
      const position = candidatePosition(candidate);
      if (!position) continue;
      const hit = distanceFromRay(ray, position);
      if (hit.distance > radiusFor(candidate, this.pickRadius)) continue;
      if (!best || hit.along < best.along) best = { candidate, ...hit };
    }
    return best;
  }

  positionPointerHandle(event) {
    const pointer = this.pointer;
    const axis = AXIS_VECTORS[pointer.handle];
    const ray = this.camera.ray(event.clientX, event.clientY, this.canvas.getBoundingClientRect());
    const parameter = closestRayAxisParameter(ray, pointer.startPosition, axis);
    if (parameter == null || pointer.startAxisParameter == null) return;
    const delta = parameter - pointer.startAxisParameter;
    const next = pointOnAxis(pointer.startPosition, axis, delta);
    setCandidatePosition(pointer.candidate, next);
    this.onTransform?.({ candidate: pointer.candidate, mode: 'position', handle: pointer.handle, position: [...candidatePosition(pointer.candidate)] });
  }

  positionPointer(event, dy, vertical) {
    const candidate = this.pointer.candidate;
    let next;
    if (this.vertical && vertical) {
      const rect = this.canvas.getBoundingClientRect();
      const worldPerPixel = 2 * this.pointer.along * Math.tan(this.camera.fov * Math.PI / 360) / Math.max(1, rect.height);
      next = [this.pointer.startPosition[0], this.pointer.startPosition[1] - dy * worldPerPixel, this.pointer.startPosition[2]];
    } else {
      const point = intersectPlane(this.camera.ray(event.clientX, event.clientY, this.canvas.getBoundingClientRect()), this.pointer.planeY);
      if (!point) return;
      next = [point[0] + this.pointer.offset[0], this.pointer.startPosition[1], point[2] + this.pointer.offset[2]];
    }
    setCandidatePosition(candidate, next);
    this.onTransform?.({ candidate, mode: 'position', handle: null, position: [...candidatePosition(candidate)] });
  }

  rotatePointerHandle(event, dx, dy) {
    const pointer = this.pointer;
    const ray = this.camera.ray(event.clientX, event.clientY, this.canvas.getBoundingClientRect());
    const angle = ringPointerAngle(ray, pointer.startPosition, pointer.handle);
    let delta;
    if (angle != null && pointer.startRingAngle != null) delta = wrappedRadians(angle - pointer.startRingAngle);
    else delta = (Math.abs(dx) >= Math.abs(dy) ? dx : -dy) * this.rotationSpeed;
    const next = [...pointer.startRotation];
    next[AXIS_INDEX[pointer.handle]] += delta;
    setCandidateRotation(pointer.candidate, next);
    this.onTransform?.({ candidate: pointer.candidate, mode: 'rotate', handle: pointer.handle, rotation: [...candidateRotation(pointer.candidate)] });
  }

  rotatePointer(dx, dy, roll) {
    const candidate = this.pointer.candidate;
    const next = [...this.pointer.startRotation];
    if (roll) next[2] += dx * this.rotationSpeed;
    else {
      next[1] += dx * this.rotationSpeed;
      next[0] += dy * this.rotationSpeed;
    }
    setCandidateRotation(candidate, next);
    this.onTransform?.({ candidate, mode: 'rotate', handle: null, rotation: [...candidateRotation(candidate)] });
  }

  draw(renderer) {
    if (!this.enabled || !this.selected || this.selected.visible === false) return;
    const center = candidatePosition(this.selected);
    if (!center) return;
    const size = Math.max(.05, this.gizmoSize);
    renderer?.box?.(center, [.055, .055, .055], [1, 1, 1, 1], false, null);
    if (this.mode === 'position') {
      renderer?.line?.(center, [center[0] + size, center[1], center[2]], AXIS_COLORS.x);
      renderer?.line?.(center, [center[0], center[1] + size, center[2]], AXIS_COLORS.y);
      renderer?.line?.(center, [center[0], center[1], center[2] + size], AXIS_COLORS.z);
      renderer?.box?.([center[0] + size, center[1], center[2]], [.045, .045, .045], [...AXIS_COLORS.x, 1]);
      renderer?.box?.([center[0], center[1] + size, center[2]], [.045, .045, .045], [...AXIS_COLORS.y, 1]);
      renderer?.box?.([center[0], center[1], center[2] + size], [.045, .045, .045], [...AXIS_COLORS.z, 1]);
    } else {
      drawCircle(renderer, center, 'x', rotationRingRadius('x', size), AXIS_COLORS.x);
      drawCircle(renderer, center, 'y', rotationRingRadius('y', size), AXIS_COLORS.y);
      drawCircle(renderer, center, 'z', rotationRingRadius('z', size), AXIS_COLORS.z);
    }
  }

  destroy() {
    this.removeLayer?.();
    const canvas = this.canvas;
    const pointerId = this.pointer?.id;
    this.pointer = null;
    if (pointerId != null && canvas.hasPointerCapture?.(pointerId)) canvas.releasePointerCapture(pointerId);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.selected = null;
  }
}

export {
  AXIS_COLORS,
  AXIS_VECTORS,
  TransformGizmoController,
  candidatePosition,
  candidateRotation,
  closestRayAxisParameter,
  positionHandleHit,
  ringPointerAngle,
  rotationHandleHit,
  setCandidatePosition,
  setCandidateRotation,
};
