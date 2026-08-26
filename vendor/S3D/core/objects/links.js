// Generic Anchor-to-Anchor link object. No host graph semantics live here.
import { Vec3 } from '../math.js';
import { SceneObject } from './object.js';
import { Anchor } from './anchors.js';

class Link extends SceneObject {
  constructor({ id, from, to, color = [.45, .45, .45], flowColor = [.9, .9, .9], flow = true, speed = .15, pulseScale = [.04, .04, .04], metadata = {} } = {}) {
    super({ id, selectable: true, metadata });
    if (!(from instanceof Anchor) || !(to instanceof Anchor)) throw new Error('Link endpoints must be Anchor instances');
    this.from = from;
    this.to = to;
    this.color = [...color];
    this.flowColor = [...flowColor];
    this.flow = Boolean(flow);
    this.speed = Number(speed);
    this.pulseScale = [...pulseScale];
    this.phase = 0;
  }
  endpoints() { return { start: this.from.worldPosition(), end: this.to.worldPosition() }; }
  update(deltaSeconds) {
    if (!this.flow) return;
    if (!Number.isFinite(this.speed) || this.speed < 0) throw new Error('Link speed must be non-negative');
    this.phase = (this.phase + Math.max(0, deltaSeconds) * this.speed) % 1;
  }
  pointAt(progress = this.phase) {
    const { start, end } = this.endpoints();
    return Vec3.lerp(start, end, Math.max(0, Math.min(1, progress)));
  }
  draw(renderer, context = {}) {
    if (!renderer) return;
    const { start, end } = this.endpoints();
    renderer.line?.(start, end, this.color, this, context);
    if (!this.flow) return;
    if (renderer.handlers?.flow || typeof renderer.flow === 'function') {
      renderer.flow?.(start, end, this.pulseScale, this.flowColor, this.phase, this.speed, this, context);
    } else {
      renderer.box?.(this.pointAt(), this.pulseScale, this.flowColor, false, this, context);
    }
  }
}

export { Link };
