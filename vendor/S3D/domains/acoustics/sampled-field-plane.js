import { ScalarFieldView, normalizedRange } from './scalar-field-view.js';
import { SpatialSamplingPolicy, viewSamplingFrequency } from './spatial-sampling-policy.js';

function defaultColor(value) {
  const t = Math.max(0, Math.min(1, value));
  if (t < .5) return [.05 + t * .15, .18 + t * 1.2, .8 + t * .3];
  const u = (t - .5) * 2;
  return [.2 + .8 * u, .78 - .55 * u, 1 - .9 * u];
}

class SampledFieldPlane extends ScalarFieldView {
  constructor({ id, field, bounds, resolution = [36, 28], height = .025, color = defaultColor, range = null, frequency = null, frequencyRange = null, aggregation = 'single', samplingPolicy = null, protectFromTransparency = true, metadata = {} } = {}) {
    super({ id, field, range, frequency, frequencyRange, aggregation, selectable: false, metadata });
    if (!bounds?.min || !bounds?.max) throw new Error('SampledFieldPlane requires min/max bounds');
    this.bounds = { min: [...bounds.min], max: [...bounds.max] };
    this.resolution = [...resolution];
    this.samplingPolicy = samplingPolicy ?? new SpatialSamplingPolicy();
    this.samplingState = null;
    this.height = Number(height);
    this.color = color;
    this.protectFromTransparency = Boolean(protectFromTransparency);
    this.sampleRange = [0, 0];
    this.range = this.valueRange ? [...this.valueRange] : [0, 0];
    this.samples = [];
    this.dirty = true;
  }

  setBounds(bounds) { this.bounds = { min: [...bounds.min], max: [...bounds.max] }; return this.invalidate(); }
  setResolution(value) { this.resolution = [...value]; return this.invalidate(); }
  setSamplingPolicy(value) { this.samplingPolicy = value ?? new SpatialSamplingPolicy(); return this.invalidate(); }
  setProtectFromTransparency(value) { this.protectFromTransparency = Boolean(value); return this; }
  invalidate() { this.dirty = true; return this; }
  sample(x, y, z) { return this.sampleField([x, y, z]); }

  effectiveResolution() {
    const { min, max } = this.bounds;
    this.samplingState = this.samplingPolicy.resolutionFor({
      lengths: [max[0] - min[0], max[2] - min[2]],
      baseResolution: this.resolution,
      frequencyHz: viewSamplingFrequency(this),
    });
    return this.samplingState.resolution;
  }

  recolor() {
    if (!this.samples.length) { this.range = this.valueRange ? [...this.valueRange] : [...this.sampleRange]; return this; }
    const [low, high] = this.valueRange ?? this.sampleRange;
    const span = Math.max(1e-12, high - low);
    for (const sample of this.samples) sample.color = this.color((sample.value - low) / span, sample.value, low, high);
    this.range = [low, high];
    return this;
  }

  rebuild() {
    const [nx, nz] = this.effectiveResolution().map(Number);
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
    this.samples = raw.map(({ x, z, value }) => ({ position: [x, min[1], z], scale: [dx * .49, this.height, dz * .49], color: [0, 0, 0], value }));
    this.sampleRange = [low, high];
    this.recolor();
    this.dirty = false;
  }

  update() { if (this.visible !== false && this.dirty) this.rebuild(); }
  draw(renderer, context = {}) { for (const sample of this.samples) renderer?.box?.(sample.position, sample.scale, sample.color, false, this, context); }
}

export { SampledFieldPlane, defaultColor, normalizedRange };
