# AcousticMate

AcousticMate is a browser-based room-acoustics tool built from the standalone WebGUI and S3D frameworks.

## Current vertical slice

- analytical rectangular-room modes with normalized modal weighting
- multiple independently draggable speaker nodes
- phase-aware complex pressure summation
- frequency-dependent loudspeaker directivity and orientation
- JSON-backed reusable speaker library with generic starting models
- structural `SpeakerSet` groups for line arrays, clusters, sub arrays, stacks and generic/distributed groups
- dedicated SpeakerSet editor using member-local positions and orientations
- line-array, cluster and sub-array geometry helpers
- complete-set manipulation in the main visualizer while member speakers remain individually calculated
- live field resampling while a speaker or set moves
- selectable 2D heatmap, 3D orthogonal slices or both together
- independently adjustable 3D slice counts per axis
- wavelength-aware spatial sampling with a bounded interactive resolution budget
- horizontal dragging and Shift-drag vertical placement
- per-speaker gain, delay and polarity
- Butterworth, Linkwitz–Riley and Bessel high/low-pass filters
- per-speaker parametric EQ
- reusable signal-chain and crossover-routing models, including SpeakerSet targets
- frequency slider and speaker/set enable controls
- S3D orbit and zoom controls

## Speaker library

Speaker definitions are data files under `speaker-library/`. The manifest lists available models and each model may provide dimensions, frequency response and frequency-dependent directivity. Generic definitions are explicitly placeholders rather than manufacturer measurement data.

Manufacturer-specific libraries can be added without changing solver or UI code.

## Run locally

Clone only `AcousticMate`. The required S3D and WebGUI runtime snapshots are committed under `vendor/`, so no sibling clones or package installation are required.

The canonical startup path runs the complete AcousticMate Node test suite as a conformance gate before opening the HTTP server. If any test fails, the server is not started.

```sh
git clone https://github.com/Th3Hypn0tist/AcousticMate.git
cd AcousticMate
npm start
```

Open `http://127.0.0.1:8000/`.

Optional environment variables:

```sh
ACOUSTICMATE_HOST=127.0.0.1 ACOUSTICMATE_PORT=8000 npm start
```

`npm test` runs the same AcousticMate suite without starting the server.

Serving the repository directly with another static HTTP server bypasses the startup test gate and is therefore not the canonical development startup path.

S3D and WebGUI remain independently owned standalone frameworks. Their `vendor/` copies are distribution snapshots used by AcousticMate and should be refreshed from the corresponding upstream repositories when framework versions are updated.

The application contracts are in `Contracts/`.
