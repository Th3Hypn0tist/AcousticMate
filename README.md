# AcousticMate

AcousticMate is a browser-based room-acoustics tool built from the standalone WebGUI and S3D frameworks.

## Current vertical slice

- analytical rectangular-room modes
- multiple independently draggable speaker nodes
- phase-aware complex pressure summation
- live field resampling while a speaker moves
- per-speaker gain, delay and polarity
- Butterworth, Linkwitz–Riley and Bessel high/low-pass filters
- per-speaker parametric EQ
- reusable signal-chain and crossover-routing models
- frequency slider and speaker enable controls
- S3D orbit and zoom controls

## Run locally

Clone only `AcousticMate`, serve its repository directory with any static HTTP server and open the server URL in a browser. The required S3D and WebGUI runtime snapshots are committed under `vendor/`, so no sibling clones or package installation are required.

```sh
git clone https://github.com/Th3Hypn0tist/AcousticMate.git
cd AcousticMate
python3 -m http.server 8000
```

Open `http://localhost:8000/`.

S3D and WebGUI remain independently owned standalone frameworks. Their `vendor/` copies are distribution snapshots used by AcousticMate and should be refreshed from the corresponding upstream repositories when framework versions are updated.

The application contracts are in `Contracts/`.
