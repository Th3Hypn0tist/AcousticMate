// Generic collapsible property/list group attached to a scene object.
import { Group } from './object.js';
import { PropsItem } from './props_item.js';

class Props extends Group {
  constructor({ id, attachTo = null, offset = [0, 0, 0], gap = .05, collapsed = false, metadata = {} } = {}) {
    super({ id, gap, collapsed, metadata });
    this.attachTo = attachTo;
    this.offset = [...offset];
  }
  addItem(item) {
    if (!(item instanceof PropsItem)) throw new Error('Props accepts PropsItem children');
    return this.add(item);
  }
  worldPosition() {
    const base = this.attachTo?.worldPosition?.() ?? super.worldPosition();
    return base.map((component, index) => component + this.offset[index]);
  }
}

export { Props };
