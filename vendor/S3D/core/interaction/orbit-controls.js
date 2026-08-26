import { Vec3 } from '../math.js';

class OrbitControls {
  constructor(canvas, camera, { rotateSpeed = .004, zoomSpeed = .001, minDistance = 1, maxDistance = 200 } = {}) {
    this.canvas = canvas;
    this.camera = camera;
    this.rotateSpeed = rotateSpeed;
    this.zoomSpeed = zoomSpeed;
    this.minDistance = minDistance;
    this.maxDistance = maxDistance;
    this.pointer = null;
    this.onContextMenu = event => event.preventDefault();
    this.onPointerDown = event => {
      if (event.button !== 2) return;
      this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    this.onPointerMove = event => {
      if (!this.pointer || event.pointerId !== this.pointer.id) return;
      const dx = event.clientX - this.pointer.x;
      const dy = event.clientY - this.pointer.y;
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      this.orbit(dx, dy);
      event.preventDefault();
    };
    this.onPointerUp = event => {
      if (!this.pointer || event.pointerId !== this.pointer.id) return;
      this.pointer = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    this.onWheel = event => { this.zoom(event.deltaY); event.preventDefault(); };
    canvas.addEventListener('contextmenu', this.onContextMenu);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  orbit(dx, dy) {
    const offset = Vec3.sub(this.camera.position, this.camera.target);
    const distance = Math.max(1e-6, Vec3.length(offset));
    let yaw = Math.atan2(offset[0], offset[2]) - dx * this.rotateSpeed;
    let pitch = Math.asin(Math.max(-1, Math.min(1, offset[1] / distance))) + dy * this.rotateSpeed;
    pitch = Math.max(-1.48, Math.min(1.48, pitch));
    const cp = Math.cos(pitch);
    this.camera.position = [
      this.camera.target[0] + Math.sin(yaw) * cp * distance,
      this.camera.target[1] + Math.sin(pitch) * distance,
      this.camera.target[2] + Math.cos(yaw) * cp * distance,
    ];
  }

  zoom(deltaY) {
    const offset = Vec3.sub(this.camera.position, this.camera.target);
    const distance = Math.max(this.minDistance, Math.min(this.maxDistance, Vec3.length(offset) * Math.exp(deltaY * this.zoomSpeed)));
    this.camera.position = Vec3.add(this.camera.target, Vec3.mul(Vec3.norm(offset), distance));
  }

  destroy() {
    const canvas = this.canvas;
    canvas.removeEventListener('contextmenu', this.onContextMenu);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    canvas.removeEventListener('wheel', this.onWheel);
  }
}

export { OrbitControls };
