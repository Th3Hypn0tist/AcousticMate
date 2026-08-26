function intersectPlane(ray, planeY) {
  const denominator = ray.direction[1];
  if (Math.abs(denominator) < 1e-9) return null;
  const distance = (planeY - ray.origin[1]) / denominator;
  if (distance < 0) return null;
  return ray.origin.map((value, index) => value + ray.direction[index] * distance);
}

class PlaneDragController {
  constructor(canvas, camera, { candidates = () => [], planeY = 0, defaultRadius = .35 } = {}) {
    this.canvas = canvas;
    this.camera = camera;
    this.candidates = candidates;
    this.planeY = planeY;
    this.defaultRadius = defaultRadius;
    this.drag = null;
    this.onPointerDown = event => {
      if (event.button !== 0) return;
      const point = this.point(event);
      if (!point) return;
      let best = null;
      for (const object of this.candidates()) {
        if (!object || object.visible === false || object.draggable === false) continue;
        const position = object.worldPosition?.() ?? object.position;
        const distance = Math.hypot(position[0] - point[0], position[2] - point[2]);
        const radius = Number(object.dragRadius ?? this.defaultRadius);
        if (distance <= radius && (!best || distance < best.distance)) best = { object, distance, position };
      }
      if (!best) return;
      this.drag = {
        id: event.pointerId,
        object: best.object,
        offset: [best.position[0] - point[0], 0, best.position[2] - point[2]],
      };
      canvas.setPointerCapture(event.pointerId);
      best.object.emit?.('dragStart', { position: [...best.object.position] });
      event.preventDefault();
    };
    this.onPointerMove = event => {
      if (!this.drag || event.pointerId !== this.drag.id) return;
      const point = this.point(event);
      if (!point) return;
      const object = this.drag.object;
      const position = [point[0] + this.drag.offset[0], object.position[1], point[2] + this.drag.offset[2]];
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

  point(event) {
    return intersectPlane(this.camera.ray(event.clientX, event.clientY, this.canvas.getBoundingClientRect()), this.planeY);
  }

  destroy() {
    const canvas = this.canvas;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
  }
}

export { PlaneDragController, intersectPlane };
