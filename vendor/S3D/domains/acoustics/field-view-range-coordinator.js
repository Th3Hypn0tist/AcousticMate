function validRange(value) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) && value[1] >= value[0];
}

class FieldViewRangeCoordinator {
  constructor({ views = [] } = {}) {
    this.views = [...views];
    this.range = [0, 0];
    this.activeSignature = '';
    this.rangeDirty = true;
  }

  setViews(views = []) {
    this.views = [...views];
    this.activeSignature = '';
    this.rangeDirty = true;
    return this;
  }

  activeViews() {
    return this.views.filter(view => view && view.visible !== false && typeof view.setRange === 'function');
  }

  update() {
    const active = this.activeViews();
    for (const view of active) view.update?.();

    const activeSignature = active.map(view => view.id ?? '').join('|');
    if (activeSignature !== this.activeSignature) {
      this.activeSignature = activeSignature;
      this.rangeDirty = true;
    }
    if (!this.rangeDirty) return this;

    const ranges = active.map(view => view.sampleRange).filter(validRange);
    if (!ranges.length) return this;
    const next = [Math.min(...ranges.map(range => range[0])), Math.max(...ranges.map(range => range[1]))];
    this.range = next;
    this.rangeDirty = false;
    for (const view of active) view.setRange(next);
    return this;
  }

  invalidate() {
    const topologyOnly = this.views.some(view => view?.consumeRangeStableMutation?.() === true);
    if (!topologyOnly) this.rangeDirty = true;
    return this;
  }
}

export { FieldViewRangeCoordinator, validRange };
