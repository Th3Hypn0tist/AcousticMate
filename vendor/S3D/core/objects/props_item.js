// Generic item displayed inside a Props group.
import { SceneObject } from './object.js';

class PropsItem extends SceneObject {
  constructor({ id, label = '', value = null, color = [.24, .28, .34], metadata = {} } = {}) {
    super({ id, metadata });
    this.label = String(label);
    this.value = value;
    this.color = [...color];
  }
  draw(renderer, context = {}) {
    renderer?.box?.(this.worldPosition(), this.scale, this.color, false, this, context);
  }
}

export { PropsItem };
