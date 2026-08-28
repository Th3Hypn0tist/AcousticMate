import { SceneObject } from '../../core/objects/object.js';

function normalizedDirection(value) {
  if (!Array.isArray(value) || value.length !== 3 || value.some(component => !Number.isFinite(component))) throw new Error('SpeakerNode direction must be a finite [x,y,z] vector');
  const magnitude = Math.hypot(...value);
  if (magnitude <= Number.EPSILON) throw new Error('SpeakerNode direction must not be zero');
  return value.map(component => component / magnitude);
}

function normalizedOrientation(value) {
  if (!Array.isArray(value) || value.length !== 4 || value.some(component => !Number.isFinite(component))) throw new Error('SpeakerNode direction orientation must be a finite quaternion');
  const magnitude = Math.hypot(...value);
  if (magnitude <= Number.EPSILON) throw new Error('SpeakerNode direction orientation must not be zero');
  return value.map(component => component / magnitude);
}

function quaternionDirection(orientation, forward = [0, 0, 1]) {
  if (!Array.isArray(orientation) || orientation.length !== 4 || orientation.some(component => !Number.isFinite(component))) return normalizedDirection(forward);
  const magnitude = Math.hypot(...orientation);
  if (magnitude <= Number.EPSILON) return normalizedDirection(forward);
  const [qx, qy, qz, qw] = orientation.map(component => component / magnitude);
  const [vx, vy, vz] = normalizedDirection(forward);
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return normalizedDirection([
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ]);
}

function numericLabel(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/(?:^|\D)(\d+)$/);
  return match?.[1] ?? null;
}

class SpeakerNode extends SceneObject {
  constructor({
    id,
    name = id,
    label = null,
    position = [0, .22, 0],
    direction = [0, 0, 1],
    directionOrientation = null,
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
    this.directionOrientation = directionOrientation == null ? null : normalizedOrientation(directionOrientation);
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
  setDirectionOrientation(value) { this.directionOrientation = value == null ? null : normalizedOrientation(value); return this; }
  effectiveDirection() { return quaternionDirection(this.directionOrientation ?? this.model?.orientation, this.direction); }
  effectiveLabel() { return this.label ?? this.model?.displayLabel ?? numericLabel(this.model?.name) ?? numericLabel(this.model?.id); }

  draw(renderer, context = {}) {
    if (!this.enabled) return;
    const center = this.worldPosition();
    const direction = this.effectiveDirection();
    renderer?.box?.(center, this.scale, this.dragging ? this.activeColor : this.color, false, this, context);

    const top = [...center];
    top[1] += this.scale[1] + .035;
    renderer?.box?.(top, [.07, .035, .07], this.directionColor, false, this, context);

    const shaftStart = center.map((component, index) => component + direction[index] * .2);
    const tip = center.map((component, index) => component + direction[index] * this.directionLength);
    renderer?.line?.(shaftStart, tip, this.directionColor, this, context);
    renderer?.box?.(tip, [.045, .045, .045], this.directionColor, false, this, context);

    const label = this.effectiveLabel();
    if (label) {
      const labelPosition = [...center];
      labelPosition[1] += this.scale[1] + .22;
      const width = Math.max(.16, label.length * .12);
      renderer?.billboardText?.(label, labelPosition, width, .18, this.labelColor, this, context);
    }
  }
}

export { SpeakerNode, numericLabel, normalizedOrientation, quaternionDirection };
