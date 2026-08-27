import { AcousticDomain } from './acoustic-domain.js';
import { CombinedAcousticField } from './combined-acoustic-field.js';
import { RoomModeSolver } from './room-mode-solver.js';

function normalizedAnalysisRange(value = [20, 200]) {
  if (!Array.isArray(value) || value.length !== 2) throw new Error('AcousticRuntime analysis range must be [minHz,maxHz]');
  const minHz = Number(value[0]);
  const maxHz = Number(value[1]);
  if (!Number.isFinite(minHz) || !Number.isFinite(maxHz) || minHz < 0 || maxHz < minHz) throw new Error('AcousticRuntime analysis range requires 0 <= minHz <= maxHz');
  return [minHz, maxHz];
}

function modalCoverageRange(analysisRange, modalBasisMaxHz = 300) {
  const [, maxHz] = normalizedAnalysisRange(analysisRange);
  modalBasisMaxHz = Number(modalBasisMaxHz);
  if (!Number.isFinite(modalBasisMaxHz) || modalBasisMaxHz <= 0) throw new Error('modalBasisMaxHz must be positive');
  const headroom = Math.max(120, maxHz * 2);
  return [0, Math.min(modalBasisMaxHz, headroom)];
}

function sameRange(a, b) { return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9; }

class AcousticRuntime {
  constructor({
    room,
    speakers = [],
    speakerSets = [],
    crossoverNetwork = null,
    frequencyRange = [20, 200],
    q = 18,
    speedOfSound = 343,
    modalBasisMaxHz = 300,
    hybrid = {},
  } = {}) {
    if (!room?.dimensions) throw new Error('AcousticRuntime requires a room');
    this.room = room;
    this.speakers = speakers;
    this.speakerSets = speakerSets;
    this.crossoverNetwork = crossoverNetwork;
    this.frequencyRange = normalizedAnalysisRange(frequencyRange);
    this.q = Number(q);
    this.speedOfSound = Number(speedOfSound);
    this.modalBasisMaxHz = Number(modalBasisMaxHz);
    this.modeSolver = new RoomModeSolver({ speedOfSound: this.speedOfSound });
    this.domain = AcousticDomain.fromRectangularRoom(room);
    this.modalCoverage = modalCoverageRange(this.frequencyRange, this.modalBasisMaxHz);
    this.modes = this.modeSolver.solve(this.domain, this.modalCoverage);
    this.combinedField = new CombinedAcousticField({
      domain: this.domain,
      modes: this.modes,
      speakers: this.speakers,
      speakerSets: this.speakerSets,
      frequencyRange: this.frequencyRange,
      crossoverNetwork: this.crossoverNetwork,
      q: this.q,
      speedOfSound: this.speedOfSound,
      hybrid,
    });
  }

  get roomField() { return this.combinedField.roomField; }
  get directField() { return this.combinedField.directField; }
  get hybridField() { return this.combinedField.hybridField; }
  get frequencyField() { return this.combinedField.frequencyField; }
  fieldAtFrequency(frequencyHz) { return this.combinedField.fieldAtFrequency(frequencyHz); }

  syncSources() { this.combinedField.setSpeakers(this.speakers, this.speakerSets); return this; }
  invalidate() { this.syncSources(); this.combinedField.invalidate(); return this; }

  setFrequencyRange(minHz, maxHz) {
    const range = normalizedAnalysisRange(Array.isArray(minHz) ? minHz : [minHz, maxHz]);
    this.frequencyRange = range;
    this.combinedField.setFrequencyRange(range[0], range[1]);
    const nextCoverage = modalCoverageRange(range, this.modalBasisMaxHz);
    if (!sameRange(nextCoverage, this.modalCoverage)) {
      this.modalCoverage = nextCoverage;
      this.modes = this.modeSolver.solve(this.domain, nextCoverage);
      this.combinedField.setModes(this.modes);
    }
    return this.invalidate();
  }

  syncRoom() {
    const nextDomain = AcousticDomain.fromRectangularRoom(this.room);
    const nextCoverage = modalCoverageRange(this.frequencyRange, this.modalBasisMaxHz);
    const nextModes = this.modeSolver.solve(nextDomain, nextCoverage);
    this.domain = nextDomain;
    this.modalCoverage = nextCoverage;
    this.modes = nextModes;
    this.combinedField.setDomain(nextDomain).setModes(nextModes);
    return this.invalidate();
  }

  snapshot() {
    return {
      domain: this.domain,
      modes: [...this.modes],
      combinedField: this.combinedField,
      directField: this.directField,
      hybridField: this.hybridField,
      frequencyField: this.frequencyField,
      frequencyRange: [...this.frequencyRange],
      modalCoverageRange: [...this.modalCoverage],
      modalBasisMaxHz: this.modalBasisMaxHz,
    };
  }
}

export { AcousticRuntime, normalizedAnalysisRange, modalCoverageRange, sameRange };
