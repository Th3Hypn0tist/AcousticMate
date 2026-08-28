import { distanceFromRay, intersectPlane } from './plane-drag-controller.js';

const AXIS_COLORS = Object.freeze({
  x: [1, .28, .28],
  y: [.35, 1, .35],
  z: [.35, .55, 1],
});

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

function drawCircle(renderer, center, axis, radius, color, segments = 48) {
  const point = angle => {
    const c = Math.cos(angle) * radius;
    const s = Math.sin(angle) * radius;
    if (axis === 'x') return [center[0], center[1] + c, center[2] + s];
    if (axis === 'y') return [center[0] + c, center[1], center[2] + s];
    return [center[0] + c, center[1] + s, center[2]];
  };
  let previous = point(0);
  for (let index = 1; index <= segments; index++) {
    const next = point(index * Math.PI * 2 / segments);
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
      const hit = this.pick(ray);
      if (!hit) return;
      const alreadySelected = this.selected === hit.candidate;
      if (!alreadySelected) this.select(hit.candidate, { mode: 'position' });
      const position = candidatePosition(hit.candidate);
      const planePoint = intersectPlane(ray, position[1]);
      this.pointer = {
        id: event.pointerId,
        candidate: hit.candidate,
        alreadySelected,
        moved: false,
        startX: event.clientX,
        startY: event.clientY,
        startPosition: [...position],
        startRotation: [...candidateRotation(hit.candidate)],
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
      if (this.mode === 'rotate') this.rotatePointer(dx, dy, event.shiftKey);
      else this.positionPointer(event, dy, event.shiftKey);
      event.preventDefault();
    };

    this.onPointerUp = event => {
      if (!this.pointer || event.pointerId !== this.pointer.id) return;
      const pointer = this.pointer;
      this.pointer = null;
      if (!pointer.moved && pointer.alreadySelected) this.toggleMode();
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
      this.pointer = null;
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
    this.onTransform?.({ candidate, mode: 'position', position: [...candidatePosition(candidate)] });
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
    this.onTransform?.({ candidate, mode: 'rotate', rotation: [...candidateRotation(candidate)] });
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
      drawCircle(renderer, center, 'x', size * .72, AXIS_COLORS.x);
      drawCircle(renderer, center, 'y', size * .82, AXIS_COLORS.y);
      drawCircle(renderer, center, 'z', size * .92, AXIS_COLORS.z);
    }
  }

  destroy() {
    this.removeLayer?.();
    const canvas = this.canvas;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.pointer = null;
    this.selected = null;
  }
}

export {
  AXIS_COLORS,
  TransformGizmoController,
  candidatePosition,
  candidateRotation,
  setCandidatePosition,
  setCandidateRotation,
};
