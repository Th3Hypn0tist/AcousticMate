import { Box, Cylinder } from '../vendor/S3D/s3d.js';
import { AcousticMaterialProfile, AcousticObject } from './acoustic-object.js';
import { RoomGeometryWorkflow } from './room-geometry-workflow.js';

const WALL_OPTIONS = [
  ['z-min', 'Front wall'],
  ['z-max', 'Back wall'],
  ['x-min', 'Left wall'],
  ['x-max', 'Right wall'],
];

const TREATMENT_COLORS = {
  absorber: [.24, .72, .95, .72],
  diffuser: [.82, .58, .28, .78],
  'bass-trap': [.58, .38, .92, .82],
};

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

class RoomEditor {
  constructor({
    gui,
    panel,
    room,
    scene,
    camera,
    roomOutline,
    field2DView,
    field3DView,
    roomField,
    dimensions,
    onOpen = null,
    onClose = null,
    onChanged = null,
  } = {}) {
    Object.assign(this, { gui, panel, room, scene, camera, roomOutline, field2DView, field3DView, roomField, dimensions, onOpen, onClose, onChanged });
    this.openingSequence = room.openings.length;
    this.objectSequence = room.acousticObjects?.length ?? 0;
    this.markers = new Map();
    this.cameraSnapshot = null;
    this.visible = false;
    this.geometryStatus = 'Current rectangular geometry is synchronized.';
    this.geometryWorkflow = new RoomGeometryWorkflow({ room });
    this.geometryWorkflow.polygonEditor.visible = false;
    this.geometryWorkflow.volume.visible = false;
    this.scene.add(this.geometryWorkflow.polygonEditor);
    this.scene.add(this.geometryWorkflow.volume);
    this.geometryWorkflow.on('solved', result => {
      const maxError = Math.max(0, ...result.measurements.map(item => Math.abs(item.error)));
      this.geometryStatus = result.diagnostics.conflicts.length
        ? `Solved with ${result.diagnostics.conflicts.length} conflict(s), max error ${maxError.toFixed(3)} m.`
        : `Geometry solved, max measurement error ${maxError.toFixed(3)} m.`;
      if (this.visible) this.render();
    });
    this.room.on('geometryChanged', () => this.applyRoomGeometry());
    this.room.on('openingAdded', () => this.applyOpenings());
    this.room.on('openingChanged', () => this.applyOpenings());
    this.room.on('openingRemoved', () => this.applyOpenings());
    this.room.on('acousticObjectAdded', () => this.applyAcousticObjects());
    this.room.on('acousticObjectChanged', () => this.applyAcousticObjects());
    this.room.on('acousticObjectRemoved', event => {
      this.scene.remove(event.object.geometry);
      this.applyAcousticObjects();
    });
    this.applyRoomGeometry();
    this.applyOpenings();
    this.applyAcousticObjects();
  }

  setMarkerVisibility(value) {
    const visible = Boolean(value);
    for (const marker of this.markers.values()) marker.visible = visible;
    for (const object of this.room.acousticObjects ?? []) object.geometry.visible = visible;
    this.geometryWorkflow.polygonEditor.visible = visible;
    this.geometryWorkflow.volume.visible = visible;
  }

  applyRoomGeometry() {
    const { width, height, depth } = this.room.dimensions;
    Object.assign(this.dimensions, this.room.dimensions);
    this.roomOutline.setPosition([width / 2, height / 2, depth / 2], { emit: false });
    this.roomOutline.scale = [width / 2, height / 2, depth / 2];
    this.field2DView.setBounds({ min: [0, .035, 0], max: [width, .035, depth] });
    this.field3DView.setBounds({ min: [0, 0, 0], max: [width, height, depth] });
    this.field3DView.setSlice('x', width / 2);
    this.field3DView.setSlice('y', height / 2);
    this.field3DView.setSlice('z', depth / 2);
    this.roomField.setRoom(this.room);
    this.applyOpenings();
    this.applyAcousticObjects();
    this.onChanged?.(this.room);
  }

  markerFor(opening) {
    let marker = this.markers.get(opening.id);
    if (marker) return marker;
    marker = new Box({
      id: `room-opening-${opening.id}`,
      position: [0, 0, 0],
      scale: [.02, .5, .5],
      color: [.2, .95, .72, .32],
      outline: false,
      selectable: false,
      visible: this.visible,
    });
    this.markers.set(opening.id, marker);
    this.scene.add(marker);
    return marker;
  }

  applyOpenings() {
    const activeIds = new Set(this.room.openings.map(opening => opening.id));
    for (const [id, marker] of this.markers) {
      if (!activeIds.has(id)) {
        this.scene.remove(marker);
        this.markers.delete(id);
      }
    }
    for (const opening of this.room.openings) {
      const marker = this.markerFor(opening);
      const { center, size } = this.room.openingRect(opening);
      const thickness = .035;
      marker.setPosition(center, { emit: false });
      marker.scale = [size[0] ? size[0] / 2 : thickness, size[1] / 2, size[2] ? size[2] / 2 : thickness];
      marker.visible = this.visible;
    }
    this.roomField.setOpenings(this.room.openings);
    this.onChanged?.(this.room);
    if (this.visible) this.render();
  }

  positionAcousticObject(object) {
    const attachment = object.attachment;
    if (!attachment) return;
    const rect = this.room.acousticObjectRect(object);
    if (!rect) return;
    const thickness = Math.max(.02, Number(object.metadata?.thickness ?? .1));
    const center = rect.center.map((value, axis) => value + rect.normal[axis] * thickness / 2);
    object.geometry.setPosition(center, { emit: false });
    object.geometry.color = [...(TREATMENT_COLORS[object.type] ?? [.65, .65, .65, .75])];
    object.geometry.visible = this.visible;
    if (object.geometry.primitive === 'cylinder') {
      const radius = attachment.width / 2;
      object.geometry.scale = [radius, attachment.height / 2, radius];
    } else if (attachment.wall.startsWith('x-')) {
      object.geometry.scale = [thickness / 2, attachment.height / 2, attachment.width / 2];
    } else {
      object.geometry.scale = [attachment.width / 2, attachment.height / 2, thickness / 2];
    }
  }

  applyAcousticObjects() {
    for (const object of this.room.acousticObjects ?? []) {
      if (!object.geometry.scene) this.scene.add(object.geometry);
      this.positionAcousticObject(object);
    }
    this.roomField.setAcousticObjects(this.room.acousticObjects ?? []);
    this.onChanged?.(this.room);
    if (this.visible) this.render();
  }

  numberField(label, value, { min = 0, max = 100, step = .01, update } = {}) {
    const input = this.gui.input({
      type: 'number', min, max, step, value,
      on: { change: event => {
        const next = Number(event.target.value);
        if (!Number.isFinite(next) || next < min || next > max) {
          event.target.setAttribute('aria-invalid', 'true');
          return;
        }
        try {
          update(next);
          event.target.removeAttribute('aria-invalid');
          event.target.removeAttribute('title');
        } catch (error) {
          event.target.setAttribute('aria-invalid', 'true');
          event.target.title = error.message;
        }
      } },
    });
    return this.gui.field(label, input, { className: 'compact-field' });
  }

  dimensionControls() {
    const d = this.room.dimensions;
    const update = key => value => this.room.setDimensions({ [key]: value });
    return this.gui.h('fieldset', { className: 'set-helper' }, [
      this.gui.h('legend', { text: 'Room dimensions' }),
      this.numberField('Width (m)', d.width, { min: .5, max: 100, update: update('width') }),
      this.numberField('Depth (m)', d.depth, { min: .5, max: 100, update: update('depth') }),
      this.numberField('Height (m)', d.height, { min: .5, max: 30, update: update('height') }),
    ]);
  }

  geometryWorkflowControls() {
    const workflow = this.geometryWorkflow;
    const referenceName = typeof workflow.referenceLayer.image?.name === 'string' ? workflow.referenceLayer.image.name : 'No reference image';
    const referenceInput = this.gui.input({
      type: 'file',
      accept: 'image/png,image/jpeg',
      on: { change: event => {
        const file = event.target.files?.[0] ?? null;
        if (!file) return;
        workflow.setReferenceImage(file);
        this.geometryStatus = `Reference loaded: ${file.name}. Image remains reference-only geometry.`;
        this.render();
      } },
    });
    const vertices = workflow.polygonEditor.vertices.map(vertex => this.gui.h('section', { className: 'speaker-card member-card' }, [
      this.gui.h('strong', { text: vertex.id }),
      this.gui.h('div', { className: 'position-grid' }, [
        this.numberField('X (m)', vertex.x, { min: -100, max: 100, update: value => workflow.polygonEditor.moveVertex(vertex, { x: value, z: vertex.z }) }),
        this.numberField('Z (m)', vertex.z, { min: -100, max: 100, update: value => workflow.polygonEditor.moveVertex(vertex, { x: vertex.x, z: value }) }),
      ]),
    ]));
    const widthMeasurement = workflow.measurements.find(item => item.id === 'room-width-front');
    const depthMeasurement = workflow.measurements.find(item => item.id === 'room-depth-right');
    const solve = () => {
      try {
        const result = workflow.solve();
        if (workflow.isAxisAlignedRectangle()) {
          workflow.commitRectangularRoom();
          this.geometryStatus = result.diagnostics.conflicts.length
            ? `Solved and committed rectangular geometry with ${result.diagnostics.conflicts.length} conflict(s).`
            : 'Solved geometry committed to rectangular room.';
        } else {
          this.geometryStatus = 'Polygon solved, but current analytical room solver only accepts an axis-aligned rectangle. Geometry was not silently coerced.';
        }
      } catch (error) {
        this.geometryStatus = error.message;
      }
      this.render();
    };
    return this.gui.h('details', { className: 'signal-chain', open: true }, [
      this.gui.h('summary', { text: 'Geometry workflow' }),
      this.gui.field('Reference JPG/PNG', referenceInput),
      this.gui.h('span', { className: 'model-name', text: referenceName }),
      this.numberField('Reference opacity', workflow.referenceLayer.opacity, { min: 0, max: 1, step: .05, update: value => workflow.setReferenceOpacity(value) }),
      this.gui.h('h3', { text: 'Polygon vertices' }),
      this.gui.h('div', { className: 'member-list' }, vertices),
      this.gui.h('h3', { text: 'Authoritative measurements' }),
      this.numberField('Front width (m)', widthMeasurement?.value ?? this.room.dimensions.width, { min: .1, max: 100, update: value => workflow.setMeasurement('room-width-front', value) }),
      this.numberField('Right depth (m)', depthMeasurement?.value ?? this.room.dimensions.depth, { min: .1, max: 100, update: value => workflow.setMeasurement('room-depth-right', value) }),
      this.gui.button('Solve measured geometry', { on: { click: solve } }),
      this.gui.h('p', { className: 'hint', text: this.geometryStatus }),
    ]);
  }

  openingCard(opening) {
    const wall = this.gui.select({
      value: opening.wall,
      on: { change: event => {
        const nextWall = event.target.value;
        const maxOffset = Math.max(0, this.room.wallSpan(nextWall) - opening.width);
        this.room.updateOpening(opening, { wall: nextWall, offset: clamp(opening.offset, 0, maxOffset) });
      } },
    }, WALL_OPTIONS.map(([value, text]) => this.gui.option(value, text)));
    const remove = this.gui.button('Remove opening', { className: 'danger-button', on: { click: () => this.room.removeOpening(opening) } });
    return this.gui.h('section', { className: 'speaker-card room-opening-card' }, [
      this.gui.h('div', { className: 'speaker-heading' }, [this.gui.h('strong', { text: opening.id }), remove]),
      this.gui.field('Wall', wall, { className: 'compact-field' }),
      this.gui.h('div', { className: 'position-grid' }, [
        this.numberField('Offset (m)', opening.offset, { min: 0, max: 100, update: value => this.room.updateOpening(opening, { offset: value }) }),
        this.numberField('Width (m)', opening.width, { min: .1, max: 20, update: value => this.room.updateOpening(opening, { width: value }) }),
        this.numberField('Height (m)', opening.height, { min: .1, max: 20, update: value => this.room.updateOpening(opening, { height: value }) }),
      ]),
      this.numberField('Sill height (m)', opening.sillHeight, { min: 0, max: 20, update: value => this.room.updateOpening(opening, { sillHeight: value }) }),
      this.gui.h('p', { className: 'hint', text: 'Open boundary: energy crossing this aperture leaves the solved room. Exterior geometry is not calculated.' }),
    ]);
  }

  addOpening() {
    const wall = 'z-min';
    const width = Math.min(.9, this.room.wallSpan(wall) * .5);
    const height = Math.min(2.1, this.room.dimensions.height);
    const offset = Math.max(0, (this.room.wallSpan(wall) - width) / 2);
    this.room.addOpening({ id: `opening-${++this.openingSequence}`, wall, offset, width, height, sillHeight: 0, type: 'open', transmission: 1 });
  }

  treatmentProfile(type, coefficient = null) {
    if (type === 'diffuser') {
      const value = coefficient ?? .65;
      return new AcousticMaterialProfile({ scattering: [[20, value], [20000, value]] });
    }
    const value = coefficient ?? (type === 'bass-trap' ? .55 : .75);
    return new AcousticMaterialProfile({ absorption: [[20, value], [20000, value]] });
  }

  addAcousticObject(type = 'absorber') {
    const wall = 'z-min';
    const width = type === 'bass-trap' ? .5 : Math.min(1.2, this.room.wallSpan(wall) * .5);
    const height = Math.min(type === 'bass-trap' ? 2.0 : .6, this.room.dimensions.height);
    const sillHeight = Math.max(0, Math.min(.8, this.room.dimensions.height - height));
    const offset = Math.max(0, (this.room.wallSpan(wall) - width) / 2);
    const id = `${type}-${++this.objectSequence}`;
    const geometry = type === 'bass-trap'
      ? new Cylinder({ id: `${id}-geometry`, color: TREATMENT_COLORS[type], segments: 20, selectable: false, visible: this.visible })
      : new Box({ id: `${id}-geometry`, color: TREATMENT_COLORS[type], selectable: false, visible: this.visible });
    const acousticModel = type === 'diffuser' ? 'scattering' : 'absorptive';
    const object = new AcousticObject({
      id,
      type,
      geometry,
      acousticModel,
      materialProfile: this.treatmentProfile(type),
      attachment: { wall, offset, width, height, sillHeight },
      metadata: { thickness: type === 'bass-trap' ? width : .1 },
    });
    this.scene.add(geometry);
    try { this.room.addAcousticObject(object); }
    catch (error) { this.scene.remove(geometry); throw error; }
  }

  acousticObjectCard(object) {
    const attachment = object.attachment;
    const wall = this.gui.select({
      value: attachment.wall,
      on: { change: event => {
        const nextWall = event.target.value;
        const maxOffset = Math.max(0, this.room.wallSpan(nextWall) - attachment.width);
        this.room.updateAcousticObject(object, { attachment: { ...attachment, wall: nextWall, offset: clamp(attachment.offset, 0, maxOffset) } });
      } },
    }, WALL_OPTIONS.map(([value, text]) => this.gui.option(value, text)));
    const coefficient = object.type === 'diffuser' ? object.scatteringAt(1000) : object.absorptionAt(125);
    const updateAttachment = key => value => this.room.updateAcousticObject(object, { attachment: { ...object.attachment, [key]: value } });
    const remove = this.gui.button('Remove', { className: 'danger-button', on: { click: () => this.room.removeAcousticObject(object) } });
    return this.gui.h('section', { className: 'speaker-card treatment-card' }, [
      this.gui.h('div', { className: 'speaker-heading' }, [this.gui.h('strong', { text: object.id }), remove]),
      this.gui.h('span', { className: 'model-name', text: `${object.type} · ${object.geometry.primitive} · ${object.acousticModel}` }),
      this.gui.field('Wall', wall, { className: 'compact-field' }),
      this.gui.h('div', { className: 'position-grid' }, [
        this.numberField('Offset (m)', attachment.offset, { min: 0, max: 100, update: updateAttachment('offset') }),
        this.numberField('Width (m)', attachment.width, { min: .05, max: 20, update: updateAttachment('width') }),
        this.numberField('Height (m)', attachment.height, { min: .05, max: 20, update: updateAttachment('height') }),
      ]),
      this.numberField('Bottom (m)', attachment.sillHeight, { min: 0, max: 20, update: updateAttachment('sillHeight') }),
      this.numberField('Thickness (m)', Number(object.metadata.thickness ?? .1), { min: .02, max: 5, update: value => { object.metadata.thickness = value; this.applyAcousticObjects(); } }),
      this.numberField(object.type === 'diffuser' ? 'Scattering' : 'Absorption', coefficient, { min: 0, max: 1, step: .01, update: value => this.room.updateAcousticObject(object, { materialProfile: this.treatmentProfile(object.type, value) }) }),
      object.type === 'diffuser'
        ? this.gui.h('p', { className: 'hint', text: 'Visual/scattering object exists now. Current modal solver does not claim exact diffuser scattering.' })
        : this.gui.h('p', { className: 'hint', text: 'Absorption contributes mode-dependent boundary loss at the attached wall area.' }),
    ]);
  }

  render() {
    if (!this.visible) return;
    this.gui.replace(this.panel, [
      this.gui.h('header', {}, [this.gui.h('h1', { text: 'Room Editor' }), this.gui.h('p', { text: 'Room geometry · boundaries · acoustic objects' })]),
      this.gui.button('← Back to visualizer', { on: { click: () => this.close() } }),
      this.dimensionControls(),
      this.geometryWorkflowControls(),
      this.gui.h('div', { className: 'speaker-heading' }, [this.gui.h('h2', { text: 'Openings' }), this.gui.button('Add opening', { on: { click: () => this.addOpening() } })]),
      this.gui.h('div', { className: 'member-list' }, this.room.openings.map(opening => this.openingCard(opening))),
      this.gui.h('div', { className: 'speaker-heading' }, [this.gui.h('h2', { text: 'Acoustic objects' })]),
      this.gui.row([
        this.gui.button('Add absorber', { on: { click: () => this.addAcousticObject('absorber') } }),
        this.gui.button('Add diffuser', { on: { click: () => this.addAcousticObject('diffuser') } }),
        this.gui.button('Add bass trap', { on: { click: () => this.addAcousticObject('bass-trap') } }),
      ], { className: 'button-row' }),
      this.gui.h('div', { className: 'member-list' }, (this.room.acousticObjects ?? []).map(object => this.acousticObjectCard(object))),
      this.gui.h('p', { className: 'hint', text: 'Openings and absorptive objects affect modal damping. Diffusers are represented as scattering boundary objects but exact scattering requires a later solver.' }),
    ]);
  }

  open() {
    if (this.visible) return;
    this.visible = true;
    this.cameraSnapshot = { position: [...this.camera.position], target: [...this.camera.target] };
    const { width, height, depth } = this.room.dimensions;
    this.camera.position = [width * 1.15, height * 1.65, depth * 1.35];
    this.camera.target = [width / 2, height / 2, depth / 2];
    this.panel.hidden = false;
    this.setMarkerVisibility(true);
    this.onOpen?.();
    this.render();
  }

  close() {
    if (!this.visible) return;
    this.visible = false;
    this.panel.hidden = true;
    this.setMarkerVisibility(false);
    if (this.cameraSnapshot) {
      this.camera.position = [...this.cameraSnapshot.position];
      this.camera.target = [...this.cameraSnapshot.target];
    }
    this.cameraSnapshot = null;
    this.onClose?.();
  }
}

export { RoomEditor };
