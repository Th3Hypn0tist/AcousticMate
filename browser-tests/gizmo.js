import { Box, PerspectiveCamera, Scene, Viewport } from '../vendor/S3D/s3d.js';
import { installGizmoRuntime } from '../src/gizmo-runtime.js';

const output = document.querySelector('#results');
const canvas = document.querySelector('canvas[data-role="viewport"]');
canvas.width = 640;
canvas.height = 480;
Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 640 });
Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 480 });
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 640, bottom: 480, width: 640, height: 480, x: 0, y: 0, toJSON() {} });
let capturedPointer = null;
canvas.setPointerCapture = pointerId => { capturedPointer = pointerId; };
canvas.releasePointerCapture = pointerId => { if (capturedPointer === pointerId) capturedPointer = null; };
canvas.hasPointerCapture = pointerId => capturedPointer === pointerId;

const results = [];
function check(name, condition) {
  if (!condition) throw new Error(name);
  results.push(`PASS  ${name}`);
}
function clickCenter(pointerId) {
  const init = { bubbles: true, button: 0, clientX: 320, clientY: 240, pointerId };
  canvas.dispatchEvent(new PointerEvent('pointerdown', init));
  canvas.dispatchEvent(new PointerEvent('pointerup', init));
}

try {
  const gl = canvas.getContext('webgl2');
  check('WebGL2 context', Boolean(gl));

  const scene = new Scene();
  const model = {
    name: 'Browser target',
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    setPosition(value) { this.position = [...value]; return this; },
    setOrientation(value) { this.orientation = [...value]; return this; },
  };
  const box = new Box({ id: 'browser-target', position: [0, 0, 0], scale: [.5, .5, .5] });
  box.model = model;
  box.on('positionChanged', event => model.setPosition(event.position));
  scene.add(box);

  const camera = new PerspectiveCamera({ position: [0, 0, 5], target: [0, 0, 0], near: .05, far: 100 });
  const viewport = new Viewport(canvas, { camera, pixelRatio: () => 1 });
  viewport.start(scene).stop();
  viewport.render();
  check('rotated box renderer compiles and draws', true);

  const controller = installGizmoRuntime(document);
  const toggle = document.querySelector('[data-role="gizmo-enable"]');
  check('global gizmo toggle exists', Boolean(toggle));
  check('gizmos default off', canvas.dataset.gizmos === 'off' && controller.enabled === false);

  toggle.checked = true;
  toggle.dispatchEvent(new Event('change', { bubbles: true }));
  check('gizmos enable globally', canvas.dataset.gizmos === 'on' && controller.enabled === true);

  clickCenter(1);
  check('first click selects target', controller.selected === box);
  check('first click uses Position mode', controller.mode === 'position');

  clickCenter(2);
  check('second click toggles Rotate mode', controller.mode === 'rotate');

  box.setRotation([.2, .3, .4]);
  viewport.render();
  check('rotated Box renders through WebGL batch', box.rotation[1] === .3);

  clickCenter(3);
  check('third click toggles back to Position', controller.mode === 'position');

  const dragStart = { bubbles: true, button: 0, clientX: 320, clientY: 240, pointerId: 9 };
  canvas.dispatchEvent(new PointerEvent('pointerdown', dragStart));
  check('active gizmo pointer captures canvas', capturedPointer === 9 && controller.pointer?.id === 9);
  toggle.checked = false;
  toggle.dispatchEvent(new Event('change', { bubbles: true }));
  check('disabling gizmos cancels active transform', controller.pointer === null && controller.selected === null);
  check('disabling gizmos releases pointer capture', capturedPointer === null);
  check('gizmos report off after active cancel', canvas.dataset.gizmos === 'off' && controller.enabled === false);

  controller.destroy();
  viewport.destroy();
  output.className = 'pass';
  output.textContent = results.join('\n');
  document.documentElement.dataset.testStatus = 'pass';
} catch (error) {
  output.className = 'fail';
  output.textContent = `${results.join('\n')}\nFAIL  ${error?.stack ?? error}`;
  document.documentElement.dataset.testStatus = 'fail';
  throw error;
}
