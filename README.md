# AcousticMate

AcousticMate is a browser-based room-acoustics tool built from the standalone WebGUI and S3D frameworks.

## Current vertical slice

- analytical rectangular-room modes
- multiple independently draggable speaker nodes
- phase-aware complex pressure summation
- live field resampling while a speaker moves
- frequency slider and speaker enable controls
- S3D orbit and zoom controls

## Run locally

Clone `AcousticMate`, `S3D` and `WebGUI` as sibling directories, then serve their common parent directory with any static HTTP server. Open `/AcousticMate/` through that server. The import map intentionally resolves the two standalone frameworks from their sibling repositories during the init phase.

The application contracts are in `Contracts/`.
