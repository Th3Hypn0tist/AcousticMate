import test from 'node:test';
import assert from 'node:assert/strict';
import { RectangularRoomField } from '../src/rectangular-room-field.js';

const dimensions = { width: 6, height: 2.7, depth: 4.5 };

test('builds analytical modes inside the configured range', () => {
  const field = new RectangularRoomField({ dimensions, maxFrequency: 140 });
  assert.ok(field.modes.length > 0);
  assert.ok(field.modes.every(mode => mode.frequency <= 140));
});

test('co-located opposite-polarity speakers cancel as complex pressure', () => {
  const position = [1.2, .22, 1];
  const field = new RectangularRoomField({
    dimensions,
    frequency: 58,
    maxFrequency: 140,
    speakers: [
      { position, enabled: true, gainDb: 0, delayMs: 0, polarityInverted: false },
      { position, enabled: true, gainDb: 0, delayMs: 0, polarityInverted: true },
    ],
  });
  const [real, imaginary] = field.sampleComplex(3, 1.1, 2);
  assert.ok(Math.hypot(real, imaginary) < 1e-12);
});

test('moving a speaker changes the sampled field', () => {
  const speaker = { position: [1, .22, 1], enabled: true };
  const field = new RectangularRoomField({ dimensions, frequency: 58, maxFrequency: 140, speakers: [speaker] });
  const before = field.sample(3.2, 1.1, 2.3);
  speaker.position = [5, .22, 3.5];
  const after = field.sample(3.2, 1.1, 2.3);
  assert.notEqual(after, before);
});
