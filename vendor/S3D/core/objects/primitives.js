// Generic drawable primitive descriptors.
import { SceneObject } from './object.js';

function rotateEuler([x, y, z], [rx = 0, ry = 0, rz = 0] = []) {
  let nextX = x;
  let nextY = y * Math.cos(rx) - z * Math.sin(rx);
  let nextZ = y * Math.sin(rx) + z * Math.cos(rx);
  x = nextX * Math.cos(ry) + nextZ * Math.sin(ry);
  z = -nextX * Math.sin(ry) + nextZ * Math.cos(ry);
  y = nextY;
  nextX = x * Math.cos(rz) - y * Math.sin(rz);
  nextY = x * Math.sin(rz) + y * Math.cos(rz);
  return [nextX, nextY, z];
}

class Primitive extends SceneObject {
  constructor({ primitive = 'box', color = [.5, .5, .5], outline = false, ...options } = {}) {
    super(options);
    this.primitive = primitive;
    this.color = [...color];
    this.outline = Boolean(outline);
  }
  draw(renderer, context = {}) {
    if (!renderer) return;
    const position = this.worldPosition();
    if (this.primitive === 'box') renderer.box?.(position, this.scale, this.color, this.outline, this, context);
    else if (this.primitive === 'point') renderer.point?.(position, this.scale, this.color, this, context);
    else renderer.primitive?.(this, context);
  }
}

class Box extends Primitive {
  constructor(options = {}) { super({ ...options, primitive: 'box' }); }
}

class Point extends Primitive {
  constructor(options = {}) { super({ ...options, primitive: 'point' }); }
}

class Cylinder extends Primitive {
  constructor({ segments = 16, ...options } = {}) {
    super({ ...options, primitive: 'cylinder' });
    this.segments = Math.max(6, Math.floor(Number(segments) || 16));
  }

  draw(renderer, context = {}) {
    if (!renderer?.line) return renderer?.primitive?.(this, context);
    const center = this.worldPosition();
    const radiusX = Math.abs(Number(this.scale[0] ?? 0));
    const halfHeight = Math.abs(Number(this.scale[1] ?? 0));
    const radiusZ = Math.abs(Number(this.scale[2] ?? radiusX));
    const world = local => {
      const rotated = rotateEuler(local, this.rotation);
      return rotated.map((value, axis) => value + center[axis]);
    };
    for (let index = 0; index < this.segments; index++) {
      const a = index * Math.PI * 2 / this.segments;
      const b = (index + 1) * Math.PI * 2 / this.segments;
      const bottomA = world([Math.cos(a) * radiusX, -halfHeight, Math.sin(a) * radiusZ]);
      const bottomB = world([Math.cos(b) * radiusX, -halfHeight, Math.sin(b) * radiusZ]);
      const topA = world([Math.cos(a) * radiusX, halfHeight, Math.sin(a) * radiusZ]);
      const topB = world([Math.cos(b) * radiusX, halfHeight, Math.sin(b) * radiusZ]);
      renderer.line(bottomA, bottomB, this.color, this, context);
      renderer.line(topA, topB, this.color, this, context);
      if (index % Math.max(1, Math.floor(this.segments / 4)) === 0) renderer.line(bottomA, topA, this.color, this, context);
    }
  }
}

export { Primitive, Box, Point, Cylinder, rotateEuler };
