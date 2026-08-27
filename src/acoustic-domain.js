function boundsFromDimensions(dimensions) {
  if (!dimensions) return null;
  const { width, height, depth } = dimensions;
  if (![width, height, depth].every(value => Number.isFinite(value) && value > 0)) return null;
  return { min: [0, 0, 0], max: [width, height, depth] };
}

function dimensionsFromVolume(volumeGeometry) {
  if (volumeGeometry?.dimensions) return { ...volumeGeometry.dimensions };
  if (volumeGeometry?.volume?.height && volumeGeometry?.volume?.polygon?.vertices?.length) {
    const vertices = volumeGeometry.volume.polygon.vertices;
    const xs = vertices.map(vertex => vertex.x);
    const zs = vertices.map(vertex => vertex.z);
    return {
      width: Math.max(...xs) - Math.min(...xs),
      height: Number(volumeGeometry.volume.height),
      depth: Math.max(...zs) - Math.min(...zs),
    };
  }
  return null;
}

function inferredGeometryType(volumeGeometry) {
  if (volumeGeometry?.geometryType) return String(volumeGeometry.geometryType);
  if (volumeGeometry?.type === 'rectangular-volume') return 'rectangular';
  return 'arbitrary';
}

class AcousticDomain {
  constructor({ volumeGeometry, boundaryConditions = null, acousticObjects = null, geometryType = null, metadata = {} } = {}) {
    if (!volumeGeometry) throw new Error('AcousticDomain requires volumeGeometry');
    this.volumeGeometry = volumeGeometry;
    this.boundaryConditions = boundaryConditions ? [...boundaryConditions] : [];
    this.acousticObjects = acousticObjects ? [...acousticObjects] : [];
    this.dimensions = dimensionsFromVolume(volumeGeometry);
    this.bounds = volumeGeometry.bounds ?? boundsFromDimensions(this.dimensions);
    this.geometryType = geometryType ?? inferredGeometryType(volumeGeometry);
    this.metadata = { ...metadata };
  }

  static fromRectangularRoom(room) {
    if (!room?.dimensions) throw new Error('AcousticDomain.fromRectangularRoom requires a room');
    const dimensions = { ...room.dimensions };
    return new AcousticDomain({
      volumeGeometry: { type: 'rectangular-volume', dimensions, bounds: boundsFromDimensions(dimensions) },
      boundaryConditions: [...(room.openings ?? [])],
      acousticObjects: [...(room.acousticObjects ?? [])],
      geometryType: 'rectangular',
      metadata: { source: room },
    });
  }

  openings() { return this.boundaryConditions.filter(condition => condition?.type === 'open'); }
  solverDomain() { return this; }
}

export { AcousticDomain, boundsFromDimensions, dimensionsFromVolume, inferredGeometryType };
