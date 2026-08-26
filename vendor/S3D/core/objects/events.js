// Generic Event collection attached to a scene object.
import { Group } from './object.js';
import { EventItem } from './event_item.js';

class Events extends Group {
  constructor({ id, attachTo = null, offset = [0, 0, 0], gap = .05, metadata = {} } = {}) {
    super({ id, gap, metadata });
    this.attachTo = attachTo;
    this.offset = [...offset];
  }
  addItem(item) {
    if (!(item instanceof EventItem)) throw new Error('Events accepts EventItem children');
    return this.add(item);
  }
  worldPosition() {
    const base = this.attachTo?.worldPosition?.() ?? super.worldPosition();
    return base.map((component, index) => component + this.offset[index]);
  }
}

export { Events };
