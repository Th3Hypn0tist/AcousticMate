function intersectPlane(ray, planeY) {
  const denominator = ray.direction[1];
  if (Math.abs(denominator) < 1e-9) return null;
  const distance = (planeY - ray.origin[1]) / denominator;
  if (distance < 0) return null;
  return ray.origin.map((value, index) => value + ray.direction[index] * distance);
}

function distanceFromRay(ray, point) {
  const offset = point.map((value, index) => value - ray.origin[index]);
  const along = offset.reduce((sum, value, index) => sum + value * ray.direction[index], 0);
  if (along < 0) return { distance: Infinity, along };
  const closest = ray.origin.map((value, index) => value + ray.direction[index] * along);
  return { distance: Math.hypot(...point.map((value, index) => value - closest[index])), along };
}

function resolveBound(value, object, fallback) {
  const resolved = typeof value === 'function' ? value(object) : value;
  return Number.isFinite(resolved) ? Number(resolved) : fallback;
}

class PlaneDragController {
  constructor(canvas, camera, { candidates = () => [], planeY = 0, defaultRadius = .35, vertical = true, minY = -Infinity, maxY = Infinity } = {}) {
    this.canvas = canvas;
    this.camera = camera;
    this.candidates = candidates;
    this.planeY = planeY;
    this.defaultRadius = defaultRadius;
    this.vertical = Boolean(vertical);
    this.minY = minY;
    this.maxY = maxY;
    this.drag = null;
    this.onPointerDown = event => {
      if (event.button !== 0) return;
      const rect = this.canvas.getBoundingClientRect();
      const ray = this.camera.ray(event.clientX, event.clientY, rect);
      let best = null;
      for (const object of this.candidates()) {
        if (!object || object.visible === false || object.draggable === false) continue;
        const position = object.worldPosition?.() ?? object.position;
        const radius = Number(object.dragRadius ?? this.defaultRadius);
        const hit = distanceFromRay(ray, position);
        if (hit.distance <= radius && (!best || hit.along < best.along)) best = { object, ...hit, position };
      }
      if (!best) return;
      const vertical = this.vertical && event.shiftKey;
      const point = intersectPlane(ray, best.position[1]);
      if (!vertical && !point) return;
      const worldPerPixel = 2 * Math.max(best.along, .001) * Math.tan(this.camera.fov * Math.PI / 360) / Math.max(1, rect.height);
      this.drag = {
        id: event.pointerId,
        object: best.object,
        mode: vertical ? 'y' : 'xz',
        planeY: best.position[1],
        offset: point ? [best.position[0] - point[0], 0, best.position[2] - point[2]] : [0, 0, 0],
        startClientY: event.clientY,
        startPosition: [...best.object.position],
        worldPerPixel,
      };
      canvas.setPointerCapture(event.pointerId);
      best.object.emit?.('dragStart', { position: [...best.object.position] });
      event.preventDefault();
    };
    this.onPointerMove = event => {
      if (!this.drag || event.pointerId !== this.drag.id) return;
      const object = this.drag.object;
      let position;
      if (this.drag.mode === 'y') {
        const low = resolveBound(this.minY, object, -Infinity);
        const high = resolveBound(this.maxY, object, Infinity);
        const y = Math.max(low, Math.min(high, this.drag.startPosition[1] - (event.clientY - this.drag.startClientY) * this.drag.worldPerPixel));
        position = [this.drag.startPosition[0], y, this.drag.startPosition[2]];
      } else {
        const point = this.point(event, this.drag.planeY);
        if (!point) return;
        position = [point[0] + this.drag.offset[0], object.position[1], point[2] + this.drag.offset[2]];
      }
      if (typeof object.setPosition === 'function') object.setPosition(position);
      else object.position = position;
      object.emit?.('drag', { position: [...position] });
      event.preventDefault();
    };
    this.onPointerUp = event => {
      if (!this.drag || event.pointerId !== this.drag.id) return;
      const object = this.drag.object;
      this.drag = null;
      object.emit?.('dragEnd', { position: [...object.position] });
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
  }

  point(event, planeY = this.planeY) {
    return intersectPlane(this.camera.ray(event.clientX, event.clientY, this.canvas.getBoundingClientRect()), planeY);
  }

  destroy() {
    const canvas = this.canvas;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
  }
}

export { PlaneDragController, distanceFromRay, intersectPlane };
