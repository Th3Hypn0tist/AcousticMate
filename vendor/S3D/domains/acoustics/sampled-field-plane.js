import { SceneObject } from '../../core/objects/object.js';

function defaultColor(value) {
  const t = Math.max(0, Math.min(1, value));
  if (t < .5) return [.05 + t * .15, .18 + t * 1.2, .8 + t * .3];
  const u = (t - .5) * 2;
  return [.2 + .8 * u, .78 - .55 * u, 1 - .9 * u];
}

class SampledFieldPlane extends SceneObject {
  constructor({ id, field, bounds, resolution = [36, 28], height = .025, color = defaultColor, metadata = {} } = {}) {
    super({ id, selectable: false, metadata });
    if (!field) throw new Error('SampledFieldPlane requires a field function or sampleable object');
    if (!bounds?.min || !bounds?.max) throw new Error('SampledFieldPlane requires min/max bounds');
    this.field = field;
    this.bounds = { min: [...bounds.min], max: [...bounds.max] };
    this.resolution = [...resolution];
    this.height = Number(height);
    this.color = color;
    this.samples = [];
    this.dirty = true;
  }

  setField(field) { this.field = field; return this.invalidate(); }
  setBounds(bounds) { this.bounds = { min: [...bounds.min], max: [...bounds.max] }; return this.invalidate(); }
  setResolution(value) { this.resolution = [...value]; return this.invalidate(); }
  invalidate() { this.dirty = true; return this; }

  sample(x, y, z) {
    return typeof this.field === 'function' ? this.field(x, y, z) : this.field.sample(x, y, z);
  }

  rebuild() {
    const [nx, nz] = this.resolution.map(Number);
    if (!Number.isInteger(nx) || !Number.isInteger(nz) || nx < 2 || nz < 2) throw new Error('SampledFieldPlane resolution requires two integers >= 2');
    const { min, max } = this.bounds;
    const dx = (max[0] - min[0]) / nx;
    const dz = (max[2] - min[2]) / nz;
    const raw = [];
    let low = Infinity;
    let high = -Infinity;
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const x = min[0] + (ix + .5) * dx;
      const z = min[2] + (iz + .5) * dz;
      const value = Number(this.sample(x, min[1], z));
      const finite = Number.isFinite(value) ? value : 0;
      low = Math.min(low, finite);
      high = Math.max(high, finite);
      raw.push({ x, z, value: finite });
    }
    const span = Math.max(1e-12, high - low);
    this.samples = raw.map(({ x, z, value }) => ({
      position: [x, min[1], z],
      scale: [dx * .49, this.height, dz * .49],
      color: this.color((value - low) / span, value, low, high),
      value,
    }));
    this.range = [low, high];
    this.dirty = false;
  }

  update() { if (this.dirty) this.rebuild(); }
  draw(renderer, context = {}) {
    for (const sample of this.samples) renderer?.box?.(sample.position, sample.scale, sample.color, false, this, context);
  }
}

export { SampledFieldPlane, defaultColor };
