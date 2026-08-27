import { Box } from '../vendor/S3D/s3d.js';

const WALL_OPTIONS = [
  ['z-min', 'Front wall'],
  ['z-max', 'Back wall'],
  ['x-min', 'Left wall'],
  ['x-max', 'Right wall'],
];

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
    this.markers = new Map();
    this.cameraSnapshot = null;
    this.visible = false;
    this.room.on('geometryChanged', () => this.applyRoomGeometry());
    this.room.on('openingAdded', () => this.applyOpenings());
    this.room.on('openingChanged', () => this.applyOpenings());
    this.room.on('openingRemoved', () => this.applyOpenings());
    this.applyRoomGeometry();
    this.applyOpenings();
  }

  setMarkerVisibility(value) {
    for (const marker of this.markers.values()) marker.visible = Boolean(value);
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
      marker.scale = [
        size[0] ? size[0] / 2 : thickness,
        size[1] / 2,
        size[2] ? size[2] / 2 : thickness,
      ];
      marker.visible = this.visible;
    }
    this.roomField.setOpenings(this.room.openings);
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

  render() {
    if (!this.visible) return;
    this.gui.replace(this.panel, [
      this.gui.h('header', {}, [this.gui.h('h1', { text: 'Room Editor' }), this.gui.h('p', { text: 'Rectangular room · open boundary support' })]),
      this.gui.button('← Back to visualizer', { on: { click: () => this.close() } }),
      this.dimensionControls(),
      this.gui.h('div', { className: 'speaker-heading' }, [this.gui.h('h2', { text: 'Openings' }), this.gui.button('Add opening', { on: { click: () => this.addOpening() } })]),
      this.gui.h('div', { className: 'member-list' }, this.room.openings.map(opening => this.openingCard(opening))),
      this.gui.h('p', { className: 'hint', text: 'Current rectangular solver treats openings as mode-dependent boundary leakage. It does not solve the space outside the room.' }),
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
