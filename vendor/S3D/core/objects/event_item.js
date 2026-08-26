// Generic event/list item. The library does not interpret event semantics.
import { SceneObject } from './object.js';

class EventItem extends SceneObject {
  constructor({ id, label = '', color = [.42, .25, .09], metadata = {} } = {}) {
    super({ id, metadata });
    this.label = String(label);
    this.color = [...color];
  }
  draw(renderer, context = {}) {
    renderer?.box?.(this.worldPosition(), this.scale, this.color, false, this, context);
  }
}

export { EventItem };
