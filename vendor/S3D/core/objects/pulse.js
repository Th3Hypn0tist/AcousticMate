// Generic transient point travelling from one world position to another.
import { Vec3 } from '../math.js';
import { SceneObject } from './object.js';

class Pulse extends SceneObject {
  constructor({ id, from = [0, 0, 0], to = [0, 0, 0], progress = 0, color = [1, 1, 1], scale = [.04, .04, .04], metadata = {} } = {}) {
    super({ id, scale, metadata, selectable: false });
    this.from = [...from];
    this.to = [...to];
    this.progress = Number(progress);
    this.color = [...color];
  }
  worldPosition() { return Vec3.lerp(this.from, this.to, Math.max(0, Math.min(1, this.progress))); }
  draw(renderer, context = {}) { renderer?.box?.(this.worldPosition(), this.scale, this.color, false, this, context); }
}

export { Pulse };
