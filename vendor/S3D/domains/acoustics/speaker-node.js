import { SceneObject } from '../../core/objects/object.js';

function normalizedDirection(value) {
  if (!Array.isArray(value) || value.length !== 3 || value.some(component => !Number.isFinite(component))) throw new Error('SpeakerNode direction must be a finite [x,y,z] vector');
  const magnitude = Math.hypot(...value);
  if (magnitude <= Number.EPSILON) throw new Error('SpeakerNode direction must not be zero');
  return value.map(component => component / magnitude);
}

class SpeakerNode extends SceneObject {
  constructor({
    id,
    name = id,
    label = null,
    position = [0, .22, 0],
    direction = [0, 0, 1],
    directionLength = .72,
    color = [.95, .45, .12],
    activeColor = [1, .75, .2],
    directionColor = [1, .85, .45],
    labelColor = [1, 1, 1],
    enabled = true,
    metadata = {},
  } = {}) {
    super({ id, position, scale: [.16, .22, .16], metadata });
    this.name = String(name ?? id);
    this.label = label == null ? null : String(label);
    this.direction = normalizedDirection(direction);
    this.directionLength = Number(directionLength);
    if (!Number.isFinite(this.directionLength) || this.directionLength <= 0) throw new Error('SpeakerNode directionLength must be positive');
    this.color = [...color];
    this.activeColor = [...activeColor];
    this.directionColor = [...directionColor];
    this.labelColor = [...labelColor];
    this.enabled = Boolean(enabled);
    this.dragRadius = .42;
    this.draggable = true;
    this.dragging = false;
    this.on('dragStart', () => { this.dragging = true; });
    this.on('dragEnd', () => { this.dragging = false; });
  }

  setEnabled(value) { this.enabled = Boolean(value); this.emit('enabledChanged', { enabled: this.enabled }); return this; }
  setLabel(value) { this.label = value == null ? null : String(value); return this; }
  setDirection(value) { this.direction = normalizedDirection(value); return this; }

  draw(renderer, context = {}) {
    if (!this.enabled) return;
    const center = this.worldPosition();
    renderer?.box?.(center, this.scale, this.dragging ? this.activeColor : this.color, false, this, context);

    const top = [...center];
    top[1] += this.scale[1] + .035;
    renderer?.box?.(top, [.07, .035, .07], this.directionColor, false, this, context);

    const shaftStart = center.map((component, index) => component + this.direction[index] * .2);
    const tip = center.map((component, index) => component + this.direction[index] * this.directionLength);
    renderer?.line?.(shaftStart, tip, this.directionColor, this, context);
    renderer?.box?.(tip, [.045, .045, .045], this.directionColor, false, this, context);

    if (this.label) {
      const labelPosition = [...center];
      labelPosition[1] += this.scale[1] + .22;
      const width = Math.max(.16, this.label.length * .12);
      renderer?.billboardText?.(this.label, labelPosition, width, .18, this.labelColor, this, context);
    }
  }
}

export { SpeakerNode };
