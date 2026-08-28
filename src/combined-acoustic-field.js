import { DirectSoundField } from './direct-sound-field.js';
import { HybridAcousticField } from './hybrid-acoustic-field.js';
import { RectangularRoomField } from './rectangular-room-field.js';

const FIELD_COMPONENTS = new Set(['modal', 'hybrid', 'direct']);

function uniqueSpeakers(speakers = [], speakerSets = []) {
  const values = [];
  const seen = new Set();
  const add = speaker => { if (!speaker || seen.has(speaker)) return; seen.add(speaker); values.push(speaker); };
  for (const speaker of speakers) add(speaker);
  for (const set of speakerSets) for (const member of set?.members ?? []) add(member.speaker);
  return values;
}

function sampleComponent(owner, component, x, y, z, frequencyHz, complex = false) {
  if (!FIELD_COMPONENTS.has(component)) throw new Error(`Unknown acoustic field component: ${component}`);
  const suffix = complex ? 'sampleComplexAtFrequency' : 'sampleAtFrequency';
  if (component === 'modal') return owner.roomField[suffix](x, y, z, frequencyHz);
  if (component === 'direct') return owner.directField[suffix](x, y, z, frequencyHz);
  return owner.hybridField[suffix](x, y, z, frequencyHz);
}

class FrequencySliceField {
  constructor({ owner, frequencyHz, component = 'hybrid' } = {}) {
    this.owner = owner;
    this.frequency = Number(frequencyHz);
    this.component = component;
    this.rangeEpoch = 0;
    this.bounds = owner.domain.bounds;
    this.range = [0, Infinity];
  }
  setComponent(value) { if (!FIELD_COMPONENTS.has(value)) throw new Error(`Unknown acoustic field component: ${value}`); this.component = value; return this; }
  resetDisplayRange() { this.rangeEpoch += 1; return this; }
  sample(x, y, z) { return sampleComponent(this.owner, this.component, x, y, z, this.frequency, false); }
  sampleComplex(x, y, z) { return sampleComponent(this.owner, this.component, x, y, z, this.frequency, true); }
  sampleComponents(x, y, z) { return this.owner.hybridField.sampleComponentsComplexAtFrequency(x, y, z, this.frequency); }
  analysisSignature() { return `component:${this.component}:range:${this.rangeEpoch}`; }
}

class PhaseAwareFrequencyField {
  constructor(owner, { component = 'hybrid' } = {}) {
    this.owner = owner;
    this.bounds = owner.domain.bounds;
    this.range = [0, Infinity];
    this.frequency = null;
    this.frequencyRange = [...owner.frequencyRange];
    this.rangeEpoch = 0;
    this.setComponent(component);
  }
  setComponent(value) { if (!FIELD_COMPONENTS.has(value)) throw new Error(`Unknown acoustic field component: ${value}`); this.component = value; return this; }
  resetDisplayRange() { this.rangeEpoch += 1; return this; }
  sample(x, y, z, frequencyHz) { return sampleComponent(this.owner, this.component, x, y, z, frequencyHz, false); }
  sampleComplex(x, y, z, frequencyHz) { return sampleComponent(this.owner, this.component, x, y, z, frequencyHz, true); }
  sampleComponents(x, y, z, frequencyHz) { return this.owner.hybridField.sampleComponentsComplexAtFrequency(x, y, z, frequencyHz); }
  analysisSignature() { return `component:${this.component}:range:${this.rangeEpoch}`; }
}

class CombinedAcousticField {
  constructor({
    domain,
    modes = null,
    speakers = [],
    speakerSets = [],
    frequencyRange = [20, 200],
    crossoverNetwork = null,
    q = 18,
    speedOfSound = 343,
    hybrid = {},
  } = {}) {
    if (!domain?.dimensions) throw new Error('CombinedAcousticField currently requires a solver-ready rectangular AcousticDomain');
    this.domain = domain;
    this.modes = modes == null ? [] : [...modes];
    this.externalModes = modes != null;
    this.speakers = speakers;
    this.speakerSets = speakerSets;
    this.frequencyRange = [...frequencyRange];
    this.crossoverNetwork = crossoverNetwork;
    this.roomField = new RectangularRoomField({
      dimensions: domain.dimensions,
      openings: typeof domain.openings === 'function' ? domain.openings() : domain.boundaryConditions?.filter(condition => condition?.type === 'open') ?? [],
      acousticObjects: domain.acousticObjects ?? [],
      speakers: uniqueSpeakers(speakers, speakerSets),
      crossoverNetwork,
      modes,
      frequency: this.frequencyRange[0],
      maxFrequency: this.frequencyRange[1],
      q,
      speedOfSound,
    });
    this.directField = new DirectSoundField({ speakers, speakerSets, crossoverNetwork, speedOfSound });
    this.hybridField = new HybridAcousticField({ modalField: this.roomField, directField: this.directField, ...hybrid });
    this.frequencyField = new PhaseAwareFrequencyField(this);
  }

  fieldAtFrequency(frequencyHz, { component = this.frequencyField.component } = {}) { return new FrequencySliceField({ owner: this, frequencyHz, component }); }
  invalidate() {
    this.roomField.invalidate();
    this.directField.invalidate();
    return this;
  }

  setModes(modes) {
    if (!Array.isArray(modes)) throw new Error('CombinedAcousticField modes must be an array');
    this.modes = [...modes];
    this.externalModes = true;
    this.roomField.setModes(modes);
    return this;
  }

  setFrequencyRange(minHz, maxHz) {
    minHz = Number(minHz); maxHz = Number(maxHz);
    if (!Number.isFinite(minHz) || !Number.isFinite(maxHz) || minHz < 0 || maxHz < minHz) throw new Error('CombinedAcousticField range requires 0 <= min <= max');
    this.frequencyRange = [minHz, maxHz];
    this.frequencyField.frequencyRange = [...this.frequencyRange];
    this.hybridField.frequencyRange = [...this.frequencyRange];
    if (!this.externalModes && Math.abs(this.roomField.maxFrequency - maxHz) > 1e-9) {
      this.roomField.maxFrequency = maxHz;
      this.roomField.rebuildModes();
    }
    return this;
  }

  setSpeakers(speakers = [], speakerSets = this.speakerSets) {
    this.speakers = speakers;
    this.speakerSets = speakerSets;
    this.roomField.setSpeakers(uniqueSpeakers(speakers, speakerSets));
    this.directField.setSpeakers(speakers, speakerSets);
    return this;
  }

  setDomain(domain) {
    if (!domain?.dimensions) throw new Error('CombinedAcousticField requires a rectangular AcousticDomain');
    this.domain = domain;
    this.frequencyField.bounds = domain.bounds;
    this.roomField
      .setDimensions(domain.dimensions)
      .setOpenings(typeof domain.openings === 'function' ? domain.openings() : [])
      .setAcousticObjects(domain.acousticObjects ?? []);
    if (this.externalModes) this.roomField.setModes([]);
    return this;
  }
}

export { CombinedAcousticField, FIELD_COMPONENTS, FrequencySliceField, PhaseAwareFrequencyField, sampleComponent, uniqueSpeakers };
