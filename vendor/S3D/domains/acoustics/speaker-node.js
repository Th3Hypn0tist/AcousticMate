import { SceneObject } from '../../core/objects/object.js';

class SpeakerNode extends SceneObject {
  constructor({ id, name = id, position = [0, .22, 0], color = [.95, .45, .12], activeColor = [1, .75, .2], enabled = true, metadata = {} } = {}) {
    super({ id, position, scale: [.16, .22, .16], metadata });
    this.name = String(name ?? id);
    this.color = [...color];
    this.activeColor = [...activeColor];
    this.enabled = Boolean(enabled);
    this.dragRadius = .42;
    this.draggable = true;
    this.dragging = false;
    this.on('dragStart', () => { this.dragging = true; });
    this.on('dragEnd', () => { this.dragging = false; });
  }

  setEnabled(value) { this.enabled = Boolean(value); this.emit('enabledChanged', { enabled: this.enabled }); return this; }

  draw(renderer, context = {}) {
    if (!this.enabled) return;
    renderer?.box?.(this.worldPosition(), this.scale, this.dragging ? this.activeColor : this.color, false, this, context);
    const top = this.worldPosition();
    top[1] += this.scale[1] + .035;
    renderer?.box?.(top, [.07, .035, .07], [1, .85, .45], false, this, context);
  }
}

export { SpeakerNode };
