// Reusable high-density render store.
// Pure data batching only: no globals, host semantics or renderer mutation.

class FloatStore {
  constructor(initialCapacity = 1024) {
    this.buffer = new Float32Array(Math.max(1, initialCapacity));
    this.length = 0;
  }
  clear() { this.length = 0; }
  ensure(additional) {
    const required = this.length + additional;
    if (required <= this.buffer.length) return;
    let capacity = this.buffer.length;
    while (capacity < required) capacity *= 2;
    const next = new Float32Array(capacity);
    next.set(this.buffer.subarray(0, this.length));
    this.buffer = next;
  }
  push(...values) {
    this.ensure(values.length);
    this.buffer.set(values, this.length);
    this.length += values.length;
  }
  view() { return this.buffer.subarray(0, this.length); }
}

class RenderStore {
  constructor() {
    this.solidBoxes = new FloatStore(13 * 1024);
    this.transparentBoxes = new FloatStore(13 * 1024);
    this.outlineBoxes = new FloatStore(13 * 512);
    this.lines = new FloatStore(6 * 2048);
    this.glyphs = new FloatStore(14 * 4096);
    this.flowPulses = new FloatStore(14 * 2048);
    this.viewProjection = null;
    this.counts = { solidBoxes: 0, transparentBoxes: 0, outlineBoxes: 0, lineVertices: 0, glyphs: 0, flowPulses: 0 };
  }
  begin(viewProjection) {
    if (!viewProjection || viewProjection.length !== 16) throw new Error('RenderStore.begin requires a 4x4 viewProjection matrix');
    this.viewProjection = viewProjection;
    this.solidBoxes.clear();
    this.transparentBoxes.clear();
    this.outlineBoxes.clear();
    this.lines.clear();
    this.glyphs.clear();
    this.flowPulses.clear();
    for (const key of Object.keys(this.counts)) this.counts[key] = 0;
  }
  box(position, scale, color, outline = false, rotation = [0, 0, 0]) {
    if (!this.viewProjection) throw new Error('RenderStore.box requires begin()');
    const rawAlpha = Number(color[3] ?? 1);
    const alpha = Number.isFinite(rawAlpha) ? Math.max(0, Math.min(1, rawAlpha)) : 1;
    const transparent = !outline && alpha < 1;
    const target = outline ? this.outlineBoxes : transparent ? this.transparentBoxes : this.solidBoxes;
    target.push(
      Number(position[0]), Number(position[1]), Number(position[2]),
      Number(scale[0]), Number(scale[1]), Number(scale[2]),
      Number(rotation[0] ?? 0), Number(rotation[1] ?? 0), Number(rotation[2] ?? 0),
      Number(color[0]), Number(color[1]), Number(color[2]),
      alpha,
    );
    if (outline) this.counts.outlineBoxes += 1;
    else if (transparent) this.counts.transparentBoxes += 1;
    else this.counts.solidBoxes += 1;
  }
  line(start, end, color) {
    if (!this.viewProjection) throw new Error('RenderStore.line requires begin()');
    this.lines.push(
      Number(start[0]), Number(start[1]), Number(start[2]), Number(color[0]), Number(color[1]), Number(color[2]),
      Number(end[0]), Number(end[1]), Number(end[2]), Number(color[0]), Number(color[1]), Number(color[2]),
    );
    this.counts.lineVertices += 2;
  }
  glyph(center, size, uvRect, color, baselineOffset = 0, billboard = false) {
    if (!this.viewProjection) throw new Error('RenderStore.glyph requires begin()');
    this.glyphs.push(
      Number(center[0]), Number(center[1]), Number(center[2]),
      Number(size[0]), Number(size[1]),
      Number(uvRect[0]), Number(uvRect[1]), Number(uvRect[2]), Number(uvRect[3]),
      Number(color[0]), Number(color[1]), Number(color[2]),
      Number(baselineOffset),
      billboard ? 1 : 0,
    );
    this.counts.glyphs += 1;
  }
  flow(start, end, scale, color, phase = 0, speed = 0) {
    if (!this.viewProjection) throw new Error('RenderStore.flow requires begin()');
    this.flowPulses.push(
      Number(start[0]), Number(start[1]), Number(start[2]),
      Number(end[0]), Number(end[1]), Number(end[2]),
      Number(scale[0]), Number(scale[1]), Number(scale[2]),
      Number(color[0]), Number(color[1]), Number(color[2]),
      Number(phase), Number(speed),
    );
    this.counts.flowPulses += 1;
  }
  snapshot() {
    return {
      viewProjection: this.viewProjection,
      solidBoxes: this.solidBoxes.view(),
      transparentBoxes: this.transparentBoxes.view(),
      outlineBoxes: this.outlineBoxes.view(),
      lines: this.lines.view(),
      glyphs: this.glyphs.view(),
      flowPulses: this.flowPulses.view(),
      counts: { ...this.counts },
    };
  }
}

export { FloatStore, RenderStore };
