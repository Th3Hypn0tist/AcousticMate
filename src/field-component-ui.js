import { viewportForCanvas } from '../vendor/S3D/s3d.js';

const COMPONENT_OPTIONS = [
  ['modal', 'Modal'],
  ['hybrid', 'Hybrid'],
  ['direct', 'Direct'],
];

function installFieldComponentControls(root = document) {
  const canvas = root.querySelector('canvas[data-role="viewport"]');
  if (!canvas) throw new Error('Field component controls require the AcousticMate viewport canvas');
  const viewport = viewportForCanvas(canvas);
  if (!viewport?.scene) throw new Error('Field component controls require an initialized S3D viewport');
  const heatmap = viewport.scene.objects?.get?.('live-field-2d');
  const slices = viewport.scene.objects?.get?.('live-field-3d');
  const field = heatmap?.field;
  if (!field || typeof field.setComponent !== 'function') throw new Error('Field component controls require a component-aware acoustic field');

  const wrapper = document.createElement('div');
  wrapper.className = 'field-component-controls';
  wrapper.dataset.role = 'field-component-controls';

  const label = document.createElement('label');
  label.textContent = 'Field component ';
  const select = document.createElement('select');
  select.dataset.role = 'field-component';
  for (const [value, text] of COMPONENT_OPTIONS) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.append(option);
  }
  select.value = field.component ?? 'hybrid';
  label.append(select);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Re-normalize colors';
  reset.dataset.role = 'field-range-reset';

  const invalidateViews = () => {
    heatmap?.invalidate?.();
    slices?.invalidate?.();
  };

  select.addEventListener('change', () => {
    field.setComponent(select.value);
    invalidateViews();
    canvas.dataset.fieldComponent = field.component;
  });
  reset.addEventListener('click', () => {
    field.resetDisplayRange?.();
    invalidateViews();
  });

  wrapper.append(label, reset);
  const mainPanel = root.querySelector('.workspace-panel:not(.set-editor-panel):not(.room-editor-panel)');
  const fieldView = [...(mainPanel?.querySelectorAll?.('label') ?? [])].find(node => node.textContent?.trim().startsWith('Field view'));
  const anchor = fieldView?.closest?.('.field') ?? fieldView?.parentElement ?? null;
  if (anchor?.parentElement) anchor.parentElement.insertBefore(wrapper, anchor.nextSibling);
  else root.querySelector('.sidebar')?.prepend(wrapper);

  canvas.dataset.fieldComponent = field.component;
  return {
    field,
    select,
    reset,
    destroy() { wrapper.remove(); },
  };
}

export { COMPONENT_OPTIONS, installFieldComponentControls };
