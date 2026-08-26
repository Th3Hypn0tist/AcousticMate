// Generic drawable primitive descriptors.
import { SceneObject } from './object.js';

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

export { Primitive, Box, Point };
