import { SceneObject } from '../../core/objects/object.js';
import { defaultColor } from './sampled-field-plane.js';

const definitions = Object.freeze({
  x: { axes: [2, 1], fixed: 0, resolution: 'yz' },
  y: { axes: [0, 2], fixed: 1, resolution: 'xz' },
  z: { axes: [0, 1], fixed: 2, resolution: 'xy' },
});

class OrthogonalFieldSlices extends SceneObject {
  constructor({ id, field, bounds, slices = null, resolution = {}, thickness = .018, color = defaultColor, metadata = {} } = {}) {
    super({ id, selectable: false, metadata });
    if (!field) throw new Error('OrthogonalFieldSlices requires a field function or sampleable object');
    if (!bounds?.min || !bounds?.max) throw new Error('OrthogonalFieldSlices requires min/max volume bounds');
    this.field = field;
    this.bounds = { min: [...bounds.min], max: [...bounds.max] };
    this.slices = slices ? { ...slices } : {
      x: (bounds.min[0] + bounds.max[0]) / 2,
      y: (bounds.min[1] + bounds.max[1]) / 2,
      z: (bounds.min[2] + bounds.max[2]) / 2,
    };
    this.resolution = { xz: [32, 24], xy: [32, 16], yz: [24, 16], ...resolution };
    this.thickness = Number(thickness);
    this.color = color;
    this.samples = [];
    this.dirty = true;
    for (const axis of Object.keys(definitions)) this.validateSlice(axis, this.slices[axis]);
  }

  validateSlice(axis, value) {
    const definition = definitions[axis];
    if (!definition) throw new Error(`Unknown slice axis: ${axis}`);
    value = Number(value);
    if (!Number.isFinite(value) || value < this.bounds.min[definition.fixed] || value > this.bounds.max[definition.fixed]) {
      throw new Error(`Slice ${axis} must be inside field bounds`);
    }
    return value;
  }

  setField(field) { this.field = field; return this.invalidate(); }
  setBounds(bounds) { this.bounds = { min: [...bounds.min], max: [...bounds.max] }; return this.invalidate(); }
  setSlice(axis, value) { this.slices[axis] = this.validateSlice(axis, value); return this.invalidate(); }
  setResolution(name, value) { this.resolution[name] = [...value]; return this.invalidate(); }
  invalidate() { this.dirty = true; return this; }
  sample(position) { return typeof this.field === 'function' ? this.field(...position) : this.field.sample(...position); }

  sampleSlice(axis) {
    const definition = definitions[axis];
    const [nu, nv] = this.resolution[definition.resolution].map(Number);
    if (!Number.isInteger(nu) || !Number.isInteger(nv) || nu < 2 || nv < 2) throw new Error(`Slice ${axis} resolution requires two integers >= 2`);
    const [uAxis, vAxis] = definition.axes;
    const du = (this.bounds.max[uAxis] - this.bounds.min[uAxis]) / nu;
    const dv = (this.bounds.max[vAxis] - this.bounds.min[vAxis]) / nv;
    const samples = [];
    for (let iv = 0; iv < nv; iv++) for (let iu = 0; iu < nu; iu++) {
      const position = [0, 0, 0];
      position[definition.fixed] = this.slices[axis];
      position[uAxis] = this.bounds.min[uAxis] + (iu + .5) * du;
      position[vAxis] = this.bounds.min[vAxis] + (iv + .5) * dv;
      const scale = [this.thickness, this.thickness, this.thickness];
      scale[uAxis] = du * .49;
      scale[vAxis] = dv * .49;
      const value = Number(this.sample(position));
      samples.push({ axis, position, scale, value: Number.isFinite(value) ? value : 0 });
    }
    return samples;
  }

  rebuild() {
    const raw = Object.keys(definitions).flatMap(axis => this.sampleSlice(axis));
    const low = Math.min(...raw.map(sample => sample.value));
    const high = Math.max(...raw.map(sample => sample.value));
    const span = Math.max(1e-12, high - low);
    this.samples = raw.map(sample => ({ ...sample, color: this.color((sample.value - low) / span, sample.value, low, high) }));
    this.range = [low, high];
    this.dirty = false;
  }

  update() { if (this.dirty) this.rebuild(); }
  draw(renderer, context = {}) {
    for (const sample of this.samples) renderer?.box?.(sample.position, sample.scale, sample.color, false, this, context);
  }
}

export { OrthogonalFieldSlices };
