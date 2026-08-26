# AcousticMate Contracts v0.7

AcousticMate is a browser-based JavaScript/S3D room-acoustics tool covering low-frequency room modes, loudspeaker/subwoofer placement, crossover/filter configuration, phase-aware field calculation and 2D/3D visualization. The architecture is not restricted to home use: studio, installation and PA loudspeakers are valid first-class use cases.

## Architectural rule

```text
WebGUI:
concept-free minimalist DOM structure and rendering

S3D/core:
domain-independent structural 3D runtime

S3D/domains/acoustics:
reusable instantiable acoustic structures and visualizations

AcousticMate:
application-specific acoustic calculations, project state and orchestration

App:
instances + wiring + WebGUI composition
```

- WebGUI must not depend on S3D or AcousticMate.
- S3D core must not depend on any S3D domain.
- S3D domains may depend on S3D core.
- Neither S3D core nor its domains may depend on AcousticMate.
- Reusable acoustic concepts are allowed in `S3D/domains/acoustics`.
- AcousticMate physics must not depend on the S3D renderer.
- App may depend on WebGUI, S3D core, S3D domains and AcousticMate modules.
- Reusable stateful components are instances, never global singletons.

## Room input

1. Optional JPG/PNG floor-plan image is loaded as a reference layer.
2. User clicks wall corner points over the image.
3. User measures as many walls as possible.
4. Additional cross-room measurements can be added.
5. `ConstraintGeometrySolver` fits the polygon to explicit physical measurements.
6. Missing wall dimensions are inferred from the solved geometry.
7. Conflicts are reported rather than silently discarded.
8. User enters room height.
9. The solved 2D polygon is extruded into a 3D volume.

Explicit physical measurements are authoritative constraints; the image is only reference geometry / initial guess.

## Speaker library and models

`SpeakerModel` is reusable loudspeaker/subwoofer data. It may represent home, studio, installation or PA products.

Typical library layout:

```text
speaker-library/
  <manufacturer>/
    <model>.json
  generic/
    <model>.json
```

A model may contain dimensions, frequency range, frequency response, categories and directivity data. Library files are data, not executable application code. Missing manufacturer data must not be fabricated as measured truth.

A `Speaker` instance references a `SpeakerModel` and owns project-specific state such as position, orientation, signal chain and enabled state. The same model may be instantiated any number of times.

## Directivity / dispersion

`DirectivityModel` is frequency- and angle-dependent. Simple horizontal/vertical coverage angles are permitted as an approximation, while higher-resolution polar data may replace them later without changing the Speaker interface.

Directivity is evaluated from speaker-local azimuth/elevation after applying speaker orientation. It participates in acoustic coupling and is not merely a visualization overlay.

Omnidirectional behavior is explicit. Subwoofers may use an omni approximation where appropriate, but directional subs and arrays remain supported. No global 360-degree high-frequency assumption exists.

## Speaker sets

`SpeakerSet` is a structural group of real `Speaker` instances. Typical set types include:

- generic
- line-array
- cluster
- sub-array
- stack
- distributed

Each member has a local position and local orientation relative to the set. The set owns one parent world transform:

```text
memberWorldTransform = setWorldTransform × memberLocalTransform
```

Acoustic calculation still evaluates the individual speakers; the set is not a replacement acoustic source model.

### Speaker Set Editor

A dedicated `SpeakerSetEditor` edits the member-local structure before returning to the main visualizer. It supports 3D preview, add/remove, XYZ position, orientation, duplicate, mirror, align/distribute and type-specific helpers.

Examples:

- line array: order, spacing, splay angles, array tilt, curvature
- cluster: free member positions/orientations
- sub array: spacing, arc/radius and member processing trims
- generic: free member transforms

In the main visualizer the complete set may be moved/rotated as one manipulation target while individual member transforms remain intact.

## Loudspeakers and signal processing

The architecture supports any number of `Speaker` and `SpeakerSet` instances.

Signal processors required in V1:
- Gain
- Delay
- Polarity
- HPF
- LPF
- PEQ

Initial filter families:
- Butterworth
- Linkwitz-Riley
- Bessel

A `CrossoverNetwork` routes individual speakers or sets through independent signal chains. Crossover is routing plus signal processing, not a special acoustic solver.

## Phase-aware summation

Multiple sources are summed as complex acoustic pressure.

```text
speaker model response
× signal chain transfer function
× position/orientation/directivity coupling
× room response
= complex source contribution

Σ source contributions
= combined acoustic field
```

Do not sum dB magnitudes.

SpeakerSet members are resolved to world transforms and summed as their individual speaker contributions.

## Room-mode visualization

The visualization supports:
- one selected frequency
- a user-selected frequency range
- multiple aggregation modes for range visualization
- 2D heatmap
- 3D orthogonal slices
- 2D + 3D together
- later volume rendering / isosurfaces

The 2D heatmap remains available. The 3D view uses independently configurable XZ, XY and YZ field slices with a shared value range. A single floor-level heatmap is not considered a complete 3D field view.

`FrequencyRangeController` owns reusable frequency-range semantics, while AcousticMate decides how the range is interpreted in calculations. A selected analysis range must not imply an unrelated hard-coded global solver maximum.

The visualization is intended to expose spatial pressure maxima, minima and problematic regions directly.

## Absorbers and diffusors

AcousticMate does **not** model absorbers or diffusors. It does not create them, place them, recommend locations automatically or simulate material behavior. The field visualization only helps the user inspect the room and decide manually.

## Start scope

The contracts do not yet require:
- sloped ceilings
- floor/ceiling shape mismatch
- holes in room geometry
- reflection / ray-tracing solver
- FIR processing
- manufacturer-specific DSP formats
- acoustic-treatment modelling
- nested SpeakerSets

These may be added later as separate modules.
