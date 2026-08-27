function finite(value, name) {
  value = Number(value);
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
  return value;
}

function positive(value, name) {
  value = finite(value, name);
  if (value <= 0) throw new Error(`${name} must be positive`);
  return value;
}

class ImageReferenceLayer {
  constructor({ image = null, opacity = .5, transform = {}, visible = true } = {}) {
    this.image = null;
    this.opacity = Math.max(0, Math.min(1, Number(opacity)));
    this.position = [finite(transform.position?.[0] ?? 0, 'Reference x'), finite(transform.position?.[1] ?? 0, 'Reference z')];
    this.rotation = finite(transform.rotation ?? 0, 'Reference rotation');
    this.scaleValue = [positive(transform.scale?.[0] ?? 1, 'Reference scale x'), positive(transform.scale?.[1] ?? 1, 'Reference scale z')];
    this.visible = Boolean(visible);
    this.listeners = new Map();
    if (image != null) this.setImage(image);
  }

  on(event, listener) { const set = this.listeners.get(event) ?? new Set(); set.add(listener); this.listeners.set(event, set); return () => set.delete(listener); }
  emit(event, detail = {}) { for (const listener of this.listeners.get(event) ?? []) listener({ type: event, target: this, ...detail }); }
  setImage(image) { this.image = image; this.emit('imageChanged', { image }); return this; }
  setOpacity(value) { this.opacity = Math.max(0, Math.min(1, finite(value, 'Reference opacity'))); this.emit('transformChanged'); return this; }
  translate(dx, dz) { this.position[0] += finite(dx, 'Reference dx'); this.position[1] += finite(dz, 'Reference dz'); this.emit('transformChanged'); return this; }
  rotate(delta) { this.rotation += finite(delta, 'Reference rotation delta'); this.emit('transformChanged'); return this; }
  scale(sx, sz = sx) { this.scaleValue[0] *= positive(sx, 'Reference scale x'); this.scaleValue[1] *= positive(sz, 'Reference scale z'); this.emit('transformChanged'); return this; }
  show() { this.visible = true; this.emit('visibilityChanged', { visible: true }); return this; }
  hide() { this.visible = false; this.emit('visibilityChanged', { visible: false }); return this; }
  imageToLocal([x, z]) { x = finite(x, 'Image x') * this.scaleValue[0]; z = finite(z, 'Image z') * this.scaleValue[1]; const c = Math.cos(this.rotation), s = Math.sin(this.rotation); return [this.position[0] + x * c - z * s, this.position[1] + x * s + z * c]; }
  localToImage([x, z]) { x = finite(x, 'Local x') - this.position[0]; z = finite(z, 'Local z') - this.position[1]; const c = Math.cos(-this.rotation), s = Math.sin(-this.rotation); return [(x * c - z * s) / this.scaleValue[0], (x * s + z * c) / this.scaleValue[1]]; }
  destroy() { this.listeners.clear(); this.image = null; }
}

export { ImageReferenceLayer };
