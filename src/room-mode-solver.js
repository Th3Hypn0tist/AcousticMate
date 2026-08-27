import { modeShape, SPEED_OF_SOUND } from './rectangular-room-field.js';

function modeClassification(mode) {
  const active = [mode.nx, mode.ny, mode.nz].filter(Boolean).length;
  if (active === 1) return 'axial';
  if (active === 2) return 'tangential';
  if (active === 3) return 'oblique';
  throw new Error('Room mode requires at least one non-zero index');
}

class AnalyticalModeField {
  constructor({ mode, dimensions, frequency, bounds = null } = {}) {
    this.mode = mode;
    this.dimensions = { ...dimensions };
    this.frequency = Number(frequency);
    this.bounds = bounds ?? { min: [0, 0, 0], max: [dimensions.width, dimensions.height, dimensions.depth] };
    this.range = [-1, 1];
  }
  sample(x, y, z) { return modeShape(this.mode, [x, y, z], this.dimensions); }
}

class RoomModeSolver {
  constructor({ speedOfSound = SPEED_OF_SOUND } = {}) {
    this.speedOfSound = Number(speedOfSound);
    if (!Number.isFinite(this.speedOfSound) || this.speedOfSound <= 0) throw new Error('RoomModeSolver speedOfSound must be positive');
  }

  strategyFor(domain) {
    const dimensions = domain?.dimensions;
    return dimensions?.width > 0 && dimensions?.height > 0 && dimensions?.depth > 0 && domain?.geometryType !== 'arbitrary' ? 'analytical' : 'numerical';
  }

  solve(domain, frequencyRange = [20, 200]) {
    const strategy = this.strategyFor(domain);
    if (strategy === 'numerical') throw new Error('Numerical arbitrary-geometry eigenmode solving is outside the current AcousticMate start scope');
    const [minHzRaw, maxHzRaw] = frequencyRange;
    const minHz = Number(minHzRaw);
    const maxHz = Number(maxHzRaw);
    if (![minHz, maxHz].every(Number.isFinite) || minHz < 0 || maxHz < minHz) throw new Error('RoomModeSolver frequencyRange requires 0 <= min <= max');
    const { width, height, depth } = domain.dimensions;
    const limits = [width, height, depth].map(length => Math.ceil(maxHz * 2 * length / this.speedOfSound));
    const modes = [];
    for (let nx = 0; nx <= limits[0]; nx++) for (let ny = 0; ny <= limits[1]; ny++) for (let nz = 0; nz <= limits[2]; nz++) {
      if (nx === 0 && ny === 0 && nz === 0) continue;
      const frequency = this.speedOfSound * .5 * Math.sqrt((nx / width) ** 2 + (ny / height) ** 2 + (nz / depth) ** 2);
      if (frequency < minHz || frequency > maxHz) continue;
      const mode = { nx, ny, nz, frequency };
      const waveNumber = 2 * Math.PI * frequency / this.speedOfSound;
      modes.push({
        id: `mode-${nx}-${ny}-${nz}`,
        frequency,
        eigenvalue: waveNumber * waveNumber,
        classification: modeClassification(mode),
        indices: { nx, ny, nz },
        field: new AnalyticalModeField({ mode, dimensions: domain.dimensions, frequency }),
      });
    }
    return modes.sort((a, b) => a.frequency - b.frequency);
  }
}

export { AnalyticalModeField, RoomModeSolver, modeClassification };
