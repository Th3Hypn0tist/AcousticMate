import { AcousticDomain } from './acoustic-domain.js';
import { CombinedAcousticField } from './combined-acoustic-field.js';
import { RoomModeSolver } from './room-mode-solver.js';

function normalizedAnalysisRange(value = [20, 200]) {
  if (!Array.isArray(value) || value.length !== 2) throw new Error('AcousticRuntime analysis range must be [minHz,maxHz]');
  const minHz = Number(value[0]);
  const maxHz = Number(value[1]);
  if (!Number.isFinite(minHz) || !Number.isFinite(maxHz) || minHz < 0 || maxHz <= minHz) {
    throw new Error('AcousticRuntime analysis range requires 0 <= minHz < maxHz');
  }
  return [minHz, maxHz];
}

class AcousticRuntime {
  constructor({
    room,
    speakers = [],
    speakerSets = [],
    crossoverNetwork = null,
    frequencyRange = [20, 200],
    q = 18,
    speedOfSound = 343,
  } = {}) {
    if (!room?.dimensions) throw new Error('AcousticRuntime requires a room');
    this.room = room;
    this.speakers = speakers;
    this.speakerSets = speakerSets;
    this.crossoverNetwork = crossoverNetwork;
    this.frequencyRange = normalizedAnalysisRange(frequencyRange);
    this.q = Number(q);
    this.speedOfSound = Number(speedOfSound);
    this.modeSolver = new RoomModeSolver({ speedOfSound: this.speedOfSound });
    this.domain = AcousticDomain.fromRectangularRoom(room);
    this.modes = this.modeSolver.solve(this.domain, this.frequencyRange);
    this.combinedField = new CombinedAcousticField({
      domain: this.domain,
      modes: this.modes,
      speakers: this.speakers,
      speakerSets: this.speakerSets,
      frequencyRange: this.frequencyRange,
      crossoverNetwork: this.crossoverNetwork,
      q: this.q,
      speedOfSound: this.speedOfSound,
    });
  }

  get roomField() { return this.combinedField.roomField; }
  get frequencyField() { return this.combinedField.frequencyField; }

  fieldAtFrequency(frequencyHz) { return this.combinedField.fieldAtFrequency(frequencyHz); }

  syncSources() {
    this.combinedField.setSpeakers(this.speakers, this.speakerSets);
    return this;
  }

  invalidate() {
    this.syncSources();
    this.combinedField.invalidate();
    return this;
  }

  setFrequencyRange(minHz, maxHz) {
    const range = normalizedAnalysisRange(Array.isArray(minHz) ? minHz : [minHz, maxHz]);
    this.frequencyRange = range;
    this.combinedField.setFrequencyRange(range[0], range[1]);
    this.modes = this.modeSolver.solve(this.domain, range);
    this.combinedField.modes = [...this.modes];
    return this.invalidate();
  }

  syncRoom() {
    const nextDomain = AcousticDomain.fromRectangularRoom(this.room);
    this.domain = nextDomain;
    this.modes = this.modeSolver.solve(nextDomain, this.frequencyRange);
    this.combinedField.setDomain(nextDomain);
    this.combinedField.modes = [...this.modes];
    return this.invalidate();
  }

  snapshot() {
    return {
      domain: this.domain,
      modes: [...this.modes],
      combinedField: this.combinedField,
      frequencyField: this.frequencyField,
      frequencyRange: [...this.frequencyRange],
    };
  }
}

export { AcousticRuntime, normalizedAnalysisRange };
