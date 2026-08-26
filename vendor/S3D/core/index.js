// Public S3D module surface.
// Internal modules expose named exports only; this file assembles the optional
// convenience namespace without mutating globals or internal module state.
import { S3D_VERSION, Scene, Selection, Playback, normalizePlaybackBoundaries } from './core.js';
import { Vec3, Mat4 } from './math.js';
import { Renderer } from './renderer.js';
import { FloatStore, RenderStore } from './render_store.js';
import { GlyphAtlas, WebGLBatchRenderer } from './webgl_batch_renderer.js';
import { PerspectiveCamera } from './camera.js';
import { Viewport } from './viewport.js';
import { OrbitControls } from './interaction/orbit-controls.js';
import { PlaneDragController } from './interaction/plane-drag-controller.js';
import { SceneObject, Group } from './objects/object.js';
import { Primitive, Box, Point } from './objects/primitives.js';
import { Anchor } from './objects/anchors.js';
import { Link } from './objects/links.js';
import { PropsItem } from './objects/props_item.js';
import { Props } from './objects/props.js';
import { EventItem } from './objects/event_item.js';
import { Events } from './objects/events.js';
import { Pulse } from './objects/pulse.js';
import { Highlight } from './objects/highlight.js';

const S3D = Object.freeze({
  version: S3D_VERSION,
  Scene,
  Selection,
  Playback,
  normalizePlaybackBoundaries,
  Vec3,
  Mat4,
  Renderer,
  FloatStore,
  RenderStore,
  GlyphAtlas,
  WebGLBatchRenderer,
  PerspectiveCamera,
  Viewport,
  OrbitControls,
  PlaneDragController,
  SceneObject,
  Group,
  Primitive,
  Box,
  Point,
  Anchor,
  Link,
  PropsItem,
  Props,
  EventItem,
  Events,
  Pulse,
  Highlight,
});

export {
  S3D,
  S3D_VERSION,
  Scene,
  Selection,
  Playback,
  normalizePlaybackBoundaries,
  Vec3,
  Mat4,
  Renderer,
  FloatStore,
  RenderStore,
  GlyphAtlas,
  WebGLBatchRenderer,
  PerspectiveCamera,
  Viewport,
  OrbitControls,
  PlaneDragController,
  SceneObject,
  Group,
  Primitive,
  Box,
  Point,
  Anchor,
  Link,
  PropsItem,
  Props,
  EventItem,
  Events,
  Pulse,
  Highlight,
};
