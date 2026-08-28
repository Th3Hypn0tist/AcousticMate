// S3D host-independent runtime mechanics.
// Pure exports only: no application semantics, DOM dependency or namespace mutation.

const S3D_VERSION = '0.7.0';

class Scene {
  constructor() { this.objects = new Map(); this.layers = []; }
  add(object) { if (!object || typeof object.id !== 'string' || !object.id) throw new Error('Scene object requires a non-empty id'); if (this.objects.has(object.id)) throw new Error(`Scene object already exists: ${object.id}`); this.objects.set(object.id, object); object.scene = this; return object; }
  remove(ref) { const id = typeof ref === 'string' ? ref : ref?.id; if (!id) throw new Error('Scene.remove requires an object or id'); const object = this.objects.get(id); if (!object) return null; this.objects.delete(id); if (object.scene === this) object.scene = null; return object; }
  get(id) { return this.objects.get(id) ?? null; }
  clear() { for (const object of this.objects.values()) if (object.scene === this) object.scene = null; this.objects.clear(); }
  addLayer(layer) { if (typeof layer !== 'function') throw new Error('Scene layer must be a function'); this.layers.push(layer); return () => { this.layers = this.layers.filter(item => item !== layer); }; }
  update(deltaSeconds, now = performance.now()) { for (const object of this.objects.values()) object.update?.(deltaSeconds, now); }
  draw(renderer, context = {}) { for (const object of this.objects.values()) if (object.visible !== false) object.draw?.(renderer, context); for (const layer of this.layers) layer(renderer, context); }
}

class Selection {
  constructor() { this.values = new Set(); this.listeners = new Map(); }
  on(event, listener) { const values = this.listeners.get(event) ?? new Set(); values.add(listener); this.listeners.set(event, values); return () => values.delete(listener); }
  emit(event, detail = {}) { for (const listener of this.listeners.get(event) ?? []) listener({ type: event, target: this, ...detail }); }
  add(value) { if (!this.values.has(value)) { this.values.add(value); this.emit('changed', { values: [...this.values] }); } return this; }
  remove(value) { if (this.values.delete(value)) this.emit('changed', { values: [...this.values] }); return this; }
  toggle(value) { return this.values.has(value) ? this.remove(value) : this.add(value); }
  clear() { if (this.values.size) { this.values.clear(); this.emit('changed', { values: [] }); } return this; }
  has(value) { return this.values.has(value); }
}

function normalizePlaybackBoundaries(value = {}) { return { start: Number.isFinite(value.start) ? Number(value.start) : 0, end: Number.isFinite(value.end) ? Number(value.end) : Infinity, loop: Boolean(value.loop) }; }

class Playback {
  constructor({ time = 0, speed = 1, playing = false, boundaries = {} } = {}) { this.time = Number(time); this.speed = Number(speed); this.playing = Boolean(playing); this.boundaries = normalizePlaybackBoundaries(boundaries); this.listeners = new Map(); }
  on(event, listener) { const values = this.listeners.get(event) ?? new Set(); values.add(listener); this.listeners.set(event, values); return () => values.delete(listener); }
  emit(event, detail = {}) { for (const listener of this.listeners.get(event) ?? []) listener({ type: event, target: this, ...detail }); }
  play() { this.playing = true; this.emit('play', { time: this.time }); return this; }
  pause() { this.playing = false; this.emit('pause', { time: this.time }); return this; }
  stop() { this.playing = false; this.time = this.boundaries.start; this.emit('stop', { time: this.time }); return this; }
  seek(value) { this.time = Number(value); this.emit('seek', { time: this.time }); return this; }
  update(deltaSeconds) { if (!this.playing) return this.time; this.time += Number(deltaSeconds) * this.speed; if (this.time > this.boundaries.end) { if (this.boundaries.loop) this.time = this.boundaries.start + (this.time - this.boundaries.end); else { this.time = this.boundaries.end; this.pause(); } } if (this.time < this.boundaries.start) this.time = this.boundaries.start; this.emit('tick', { time: this.time }); return this.time; }
}

export { S3D_VERSION, Scene, Selection, Playback, normalizePlaybackBoundaries };
