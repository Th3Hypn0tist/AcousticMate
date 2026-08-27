import { RectangularRoomField } from './rectangular-room-field.js';

function uniqueSpeakers(speakers = [], speakerSets = []) {
  const values = [];
  const seen = new Set();
  const add = speaker => { if (!speaker || seen.has(speaker)) return; seen.add(speaker); values.push(speaker); };
  for (const speaker of speakers) add(speaker);
  for (const set of speakerSets) for (const member of set?.members ?? []) add(member.speaker);
  return values;
}

class FrequencySliceField {
  constructor({ owner, frequencyHz } = {}) { this.owner = owner; this.frequency = Number(frequencyHz); this.bounds = owner.domain.bounds; this.range = [0, Infinity]; }
  sample(x, y, z) { return this.owner.roomField.sampleAtFrequency(x, y, z, this.frequency); }
  sampleComplex(x, y, z) { return this.owner.roomField.sampleComplexAtFrequency(x, y, z, this.frequency); }
}

class PhaseAwareFrequencyField {
  constructor(owner) { this.owner = owner; this.bounds = owner.domain.bounds; this.range = owner.frequencyRange; }
  sample(x, y, z, frequencyHz) { return this.owner.roomField.sampleAtFrequency(x, y, z, frequencyHz); }
  sampleComplex(x, y, z, frequencyHz) { return this.owner.roomField.sampleComplexAtFrequency(x, y, z, frequencyHz); }
}

class CombinedAcousticField {
  constructor({ domain, modes = null, speakers = [], speakerSets = [], frequencyRange = [20, 200], crossoverNetwork = null, q = 18, speedOfSound = 343 } = {}) {
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
    this.frequencyField = new PhaseAwareFrequencyField(this);
  }

  fieldAtFrequency(frequencyHz) { return new FrequencySliceField({ owner: this, frequencyHz }); }
  invalidate() { this.roomField.invalidate(); return this; }

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
    this.frequencyField.range = this.frequencyRange;
    if (Math.abs(this.roomField.maxFrequency - maxHz) > 1e-9) {
      this.roomField.maxFrequency = maxHz;
      if (this.externalModes) this.roomField.invalidate();
      else this.roomField.rebuildModes();
    }
    return this;
  }

  setSpeakers(speakers = [], speakerSets = this.speakerSets) {
    this.speakers = speakers;
    this.speakerSets = speakerSets;
    this.roomField.setSpeakers(uniqueSpeakers(speakers, speakerSets));
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

export { CombinedAcousticField, FrequencySliceField, PhaseAwareFrequencyField, uniqueSpeakers };
