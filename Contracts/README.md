# AcousticMate Contracts v0.6

AcousticMate is a browser-based JavaScript/S3D room-acoustics tool focused initially on low-frequency room modes, loudspeaker/subwoofer placement, crossover/filter configuration and 3D visualization.

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
- Reusable features are modularized for later S3D use.

## Room input

1. Optional JPG/PNG floor-plan image is loaded as a reference layer.
2. User clicks wall corner points over the image.
3. User measures as many walls as possible.
4. Additional cross-room measurements can be added, especially width and depth through the room center.
5. `ConstraintGeometrySolver` fits the polygon to explicit physical measurements.
6. Missing wall dimensions are inferred from the solved geometry.
7. Conflicts are reported rather than silently discarded.
8. User enters room height.
9. The solved 2D polygon is extruded into a 3D volume.

The image is reference geometry / initial guess. Explicit physical measurements are authoritative constraints.

## Loudspeakers and subwoofers

The architecture supports any number of `Speaker` instances.

Each speaker has:
- XYZ position
- orientation
- LF frequency response
- enabled state
- independent `SignalChain`

Each speaker is bound to an independently draggable `S3D/domains/acoustics/SpeakerNode`. Moving a speaker updates its XYZ position, modal coupling, phase-aware combined field and visible field samples continuously during pointer movement. Releasing the pointer is not required before recalculation.

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

A `CrossoverNetwork` routes speakers or speaker groups through independent signal chains. Crossover is not a special solver.

## Phase-aware summation

Multiple speakers/subwoofers are summed as complex acoustic pressure.

```text
speaker response
× signal chain transfer function
× modal/spatial coupling
× room response
= complex source contribution

Σ source contributions
= combined acoustic field
```

Do not sum dB magnitudes.

This is required for meaningful subwoofer placement, delay, polarity and crossover analysis.

## Room-mode visualization

The visualization supports:
- one selected frequency
- a user-selected frequency range
- multiple aggregation modes for range visualization
- 3D slices
- samples
- later volume rendering / isosurfaces

The original 2D heatmap remains available. The V1 3D view adds independently positioned XZ, XY and YZ field slices with one shared color scale. Users can show the 2D view, the 3D view or both together. A single floor-level heatmap is not considered a complete 3D field view.

`FrequencyRangeController` is reusable state in `S3D/domains/acoustics`. It owns frequency-range semantics, while AcousticMate decides how the selected range is interpreted in its calculations.

The purpose of the visualization is to make the spatial acoustic field directly inspectable. This includes making it easier for the user to identify acoustically interesting areas, such as pressure maxima, minima and problematic regions.

## Absorbers and diffusors

AcousticMate does **not** model absorbers or diffusors.

It does not:
- create absorber/diffusor objects
- place them in the scene
- recommend their locations
- simulate their material behaviour

The 3D acoustic visualization simply makes potential locations easier for the user to inspect and decide manually.

## Dependency outline

```text
ImageReferenceLayer
        │
        ▼
PolygonEditor
        │
        ├──────── Measurement[]
        │               │
        ▼               ▼
ConstraintGeometrySolver
        │
        ▼
ExtrudedVolume ─────────────────────► S3D Scene
        │
        ▼
AcousticDomain
        │
        ▼
RoomModeSolver
        │
        ├──────── AcousticMode[]
        │
Speaker[] ─► SignalChain / CrossoverNetwork
        │
        ├──────── SpeakerModeCoupling
        │
        ▼
CombinedAcousticField
        │
        ├──────── FrequencyRangeController
        │
        ▼
ScalarField / FrequencyField
        │
        ▼
ScalarFieldView
```

## Start scope

The contracts are intentionally sufficient to begin implementation without committing to:
- sloped ceilings
- floor/ceiling shape mismatch
- holes in room geometry
- reflection / ray-tracing solver
- FIR processing
- manufacturer-specific DSP formats
- acoustic-treatment modelling

Those can be added later as separate modules if the project ever needs them.
