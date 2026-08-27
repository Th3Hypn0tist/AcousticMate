import { ScalarFieldView } from './scalar-field-view.js';
import { defaultColor } from './sampled-field-plane.js';

const definitions = Object.freeze({ x: { axes: [2, 1], fixed: 0, resolution: 'yz' }, y: { axes: [0, 2], fixed: 1, resolution: 'xz' }, z: { axes: [0, 1], fixed: 2, resolution: 'xy' } });

class OrthogonalFieldSlices extends ScalarFieldView {
  constructor({ id, field, bounds, slices = null, counts = {}, resolution = {}, thickness = .018, opacity = .28, opacities = {}, color = defaultColor, range = null, frequency = null, frequencyRange = null, aggregation = 'single', metadata = {} } = {}) {
    super({ id, field, range, frequency, frequencyRange, aggregation, selectable: false, metadata });
    if (!bounds?.min || !bounds?.max) throw new Error('OrthogonalFieldSlices requires min/max volume bounds');
    this.bounds = { min: [...bounds.min], max: [...bounds.max] };
    this.slices = slices ? { ...slices } : { x: (bounds.min[0] + bounds.max[0]) / 2, y: (bounds.min[1] + bounds.max[1]) / 2, z: (bounds.min[2] + bounds.max[2]) / 2 };
    this.resolution = { xz: [32, 24], xy: [32, 16], yz: [24, 16], ...resolution };
    this.counts = { x: 1, y: 1, z: 1, ...counts };
    this.thickness = Number(thickness);
    this.opacity = this.validateOpacity(opacity);
    this.opacities = { x: this.validateOpacity(opacities.x ?? this.opacity), y: this.validateOpacity(opacities.y ?? this.opacity), z: this.validateOpacity(opacities.z ?? this.opacity) };
    this.color = color;
    this.sampleRange = [0, 0];
    this.range = this.valueRange ? [...this.valueRange] : [0, 0];
    this.samples = [];
    this.dirty = true;
    for (const axis of Object.keys(definitions)) { this.slices[axis] = this.validateSlice(axis, this.slices[axis]); this.counts[axis] = this.validateCount(axis, this.counts[axis]); }
  }
  validateCount(axis, value) { if (!definitions[axis]) throw new Error(`Unknown slice axis: ${axis}`); value = Number(value); if (!Number.isInteger(value) || value < 0 || value > 32) throw new Error(`Slice count ${axis} must be an integer from 0 to 32`); return value; }
  validateOpacity(value) { value = Number(value); if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Slice opacity must be between 0 and 1'); return value; }
  validateSlice(axis, value) { const definition = definitions[axis]; if (!definition) throw new Error(`Unknown slice axis: ${axis}`); value = Number(value); if (!Number.isFinite(value) || value < this.bounds.min[definition.fixed] || value > this.bounds.max[definition.fixed]) throw new Error(`Slice ${axis} must be inside field bounds`); return value; }
  setBounds(bounds) { this.bounds = { min: [...bounds.min], max: [...bounds.max] }; return this.invalidate(); }
  setSlice(axis, value) { this.slices[axis] = this.validateSlice(axis, value); return this.invalidate(); }
  setSliceCount(axis, value) { this.counts[axis] = this.validateCount(axis, value); return this.invalidate(); }
  setOpacity(value) { this.opacity = this.validateOpacity(value); for (const axis of Object.keys(definitions)) this.opacities[axis] = this.opacity; return this.invalidate(); }
  setAxisOpacity(axis, value) { if (!definitions[axis]) throw new Error(`Unknown slice axis: ${axis}`); this.opacities[axis] = this.validateOpacity(value); return this.invalidate(); }
  setResolution(name, value) { this.resolution[name] = [...value]; return this.invalidate(); }
  invalidate() { this.dirty = true; return this; }
  sample(position) { return typeof this.field === 'function' ? this.field(...position) : this.field.sample(...position); }
  slicePositions(axis) { const definition = definitions[axis]; const count = this.counts[axis]; if (count === 0) return []; if (count === 1) return [this.slices[axis]]; const low = this.bounds.min[definition.fixed]; const span = this.bounds.max[definition.fixed] - low; return Array.from({ length: count }, (_, index) => low + span * (index + 1) / (count + 1)); }
  sampleSlice(axis, fixedPosition = this.slices[axis]) { const definition = definitions[axis]; const [nu, nv] = this.resolution[definition.resolution].map(Number); if (!Number.isInteger(nu) || !Number.isInteger(nv) || nu < 2 || nv < 2) throw new Error(`Slice ${axis} resolution requires two integers >= 2`); const [uAxis, vAxis] = definition.axes; const du = (this.bounds.max[uAxis] - this.bounds.min[uAxis]) / nu; const dv = (this.bounds.max[vAxis] - this.bounds.min[vAxis]) / nv; const samples = []; for (let iv = 0; iv < nv; iv++) for (let iu = 0; iu < nu; iu++) { const position = [0, 0, 0]; position[definition.fixed] = fixedPosition; position[uAxis] = this.bounds.min[uAxis] + (iu + .5) * du; position[vAxis] = this.bounds.min[vAxis] + (iv + .5) * dv; const scale = [this.thickness, this.thickness, this.thickness]; scale[uAxis] = du * .49; scale[vAxis] = dv * .49; const value = Number(this.sample(position)); samples.push({ axis, slice: fixedPosition, position, scale, value: Number.isFinite(value) ? value : 0, color: [0, 0, 0, this.opacities[axis]] }); } return samples; }
  recolor() { if (!this.samples.length) { this.range = this.valueRange ? [...this.valueRange] : [...this.sampleRange]; return this; } const [low, high] = this.valueRange ?? this.sampleRange; const span = Math.max(1e-12, high - low); for (const sample of this.samples) { const color = this.color((sample.value - low) / span, sample.value, low, high); sample.color = [color[0], color[1], color[2], this.opacities[sample.axis]]; } this.range = [low, high]; return this; }
  rebuild() { this.samples = Object.keys(definitions).flatMap(axis => this.slicePositions(axis).flatMap(position => this.sampleSlice(axis, position))); if (!this.samples.length) { this.sampleRange = [0, 0]; this.recolor(); this.dirty = false; return; } this.sampleRange = [Math.min(...this.samples.map(sample => sample.value)), Math.max(...this.samples.map(sample => sample.value))]; this.recolor(); this.dirty = false; }
  update() { if (this.visible !== false && this.dirty) this.rebuild(); }
  draw(renderer, context = {}) { for (const sample of this.samples) renderer?.box?.(sample.position, sample.scale, sample.color, false, this, context); }
}

export { OrthogonalFieldSlices };
