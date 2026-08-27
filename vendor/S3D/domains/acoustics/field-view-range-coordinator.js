function validRange(value) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) && value[1] >= value[0];
}

class FieldViewRangeCoordinator {
  constructor({ views = [] } = {}) {
    this.views = [...views];
    this.range = [0, 0];
    this.signature = '';
  }

  setViews(views = []) { this.views = [...views]; this.signature = ''; return this; }
  activeViews() { return this.views.filter(view => view && view.visible !== false && typeof view.setRange === 'function'); }
  update() {
    const active = this.activeViews();
    for (const view of active) view.update?.();
    const ranges = active.map(view => view.sampleRange).filter(value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) && value[1] >= value[0]);
    if (!ranges.length) return this;
    const next = [Math.min(...ranges.map(range => range[0])), Math.max(...ranges.map(range => range[1]))];
    const signature = `${active.map(view => view.id ?? '').join('|')}|${next[0]}|${next[1]}`;
    if (signature === this.signature) return this;
    this.signature = signature;
    this.range = next;
    for (const view of active) view.setRange(next);
    return this;
  }
  invalidate() { this.signature = ''; return this; }
}

export { FieldViewRangeCoordinator, validRange };
