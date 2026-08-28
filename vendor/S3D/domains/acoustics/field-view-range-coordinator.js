function validRange(value) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) && value[1] >= value[0];
}

const FIELD_IDS = new WeakMap();
let fieldIdSequence = 0;

function fieldIdentity(field) {
  if ((typeof field !== 'object' || field == null) && typeof field !== 'function') return String(field);
  let id = FIELD_IDS.get(field);
  if (!id) {
    id = `field-${++fieldIdSequence}`;
    FIELD_IDS.set(field, id);
  }
  return id;
}

function viewAnalysisSignature(view) {
  return JSON.stringify([
    fieldIdentity(view?.field),
    view?.frequency ?? null,
    view?.frequencyRange ?? null,
    view?.aggregation ?? null,
    view?.frequencySampleCount ?? null,
  ]);
}

class FieldViewRangeCoordinator {
  constructor({ views = [] } = {}) {
    this.views = [...views];
    this.range = [0, 0];
    this.activeSignature = '';
    this.analysisSignature = '';
    this.hasRange = false;
    this.rangeDirty = true;
  }

  setViews(views = []) {
    this.views = [...views];
    this.activeSignature = '';
    return this.resetRange();
  }

  activeViews() {
    return this.views.filter(view => view && view.visible !== false && typeof view.setRange === 'function');
  }

  update() {
    const active = this.activeViews();
    for (const view of active) view.update?.();
    if (!active.length) return this;

    const activeSignature = active.map(view => view.id ?? '').join('|');
    if (activeSignature !== this.activeSignature) {
      this.activeSignature = activeSignature;
      this.rangeDirty = true;
    }
    if (!this.rangeDirty) return this;

    const ranges = active.map(view => view.sampleRange).filter(validRange);
    if (!ranges.length) return this;
    const next = [Math.min(...ranges.map(range => range[0])), Math.max(...ranges.map(range => range[1]))];
    const analysisSignature = active.map(viewAnalysisSignature).join('|');
    const sameAnalysis = this.hasRange && analysisSignature === this.analysisSignature;
    this.range = sameAnalysis
      ? [Math.min(this.range[0], next[0]), Math.max(this.range[1], next[1])]
      : next;
    this.analysisSignature = analysisSignature;
    this.hasRange = true;
    this.rangeDirty = false;
    for (const view of active) view.setRange(this.range);
    return this;
  }

  invalidate() {
    const topologyOnly = this.views.some(view => view?.consumeRangeStableMutation?.() === true);
    if (!topologyOnly) this.rangeDirty = true;
    return this;
  }

  resetRange() {
    this.hasRange = false;
    this.analysisSignature = '';
    this.rangeDirty = true;
    return this;
  }
}

export { FieldViewRangeCoordinator, fieldIdentity, validRange, viewAnalysisSignature };
