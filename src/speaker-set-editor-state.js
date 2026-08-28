const HELPER_DEFAULTS = Object.freeze({
  'line-array': set => ({
    count: Math.max(1, set.members.length || 4),
    spacing: .28,
    splay: 5,
    tilt: 0,
    curvature: 0,
  }),
  cluster: () => ({
    radius: .35,
    spread: 60,
  }),
  'sub-array': set => ({
    count: Math.max(1, set.members.length || 2),
    spacing: .8,
    arc: 0,
    radius: 4,
  }),
});

function helperDefaultsFor(set) {
  if (!set?.members || typeof set.type !== 'string') throw new Error('SpeakerSet editor state requires a SpeakerSet');
  return HELPER_DEFAULTS[set.type]?.(set) ?? {};
}

class SpeakerSetEditorState {
  constructor(set) {
    if (!set?.members || typeof set.type !== 'string') throw new Error('SpeakerSet editor state requires a SpeakerSet');
    this.set = set;
    this.type = set.type;
    this.values = helperDefaultsFor(set);
    this.touched = new Set();
  }

  setValue(key, value) {
    if (!(key in this.values)) throw new Error(`Unknown ${this.type} helper value: ${key}`);
    value = Number(value);
    if (!Number.isFinite(value)) throw new Error(`Helper value ${key} must be finite`);
    this.values[key] = value;
    this.touched.add(key);
    return this;
  }

  syncMemberCount() {
    if (!('count' in this.values) || this.touched.has('count')) return this;
    this.values.count = Math.max(1, this.set.members.length || this.values.count);
    return this;
  }

  applied() {
    if ('count' in this.values) {
      this.values.count = Math.max(1, this.set.members.length || 1);
      this.touched.delete('count');
    }
    return this;
  }

  snapshot() {
    return { type: this.type, values: { ...this.values }, touched: [...this.touched] };
  }
}

export { HELPER_DEFAULTS, SpeakerSetEditorState, helperDefaultsFor };
