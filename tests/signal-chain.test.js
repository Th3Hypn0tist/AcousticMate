import test from 'node:test';
import assert from 'node:assert/strict';
import { Complex } from '../src/complex.js';
import { CrossoverNetwork } from '../src/crossover-network.js';
import { SignalChain } from '../src/signal-chain.js';
import { Speaker } from '../src/speaker.js';
import { Delay, Gain, HighPassFilter, LowPassFilter, ParametricEQ, Polarity } from '../src/signal-processors.js';

const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test('gain, delay and polarity produce a phase-aware complex transfer', () => {
  const chain = new SignalChain({ processors: [
    new Gain({ id: 'gain', db: 6 }),
    new Delay({ id: 'delay', ms: 2.5 }),
    new Polarity({ id: 'polarity', inverted: true }),
  ] });
  const transfer = chain.evaluateFrequencyResponse(100);
  close(transfer[0], 0, 1e-12);
  close(transfer[1], 10 ** (6 / 20));
});

test('disabled processors contribute identity transfer', () => {
  const processor = new Gain({ id: 'gain', db: -60, enabled: false });
  assert.deepEqual(processor.evaluate(80), [1, 0]);
});

test('filter families are normalized at their configured frequency', () => {
  for (const family of ['Butterworth', 'Bessel']) {
    const lowPass = new LowPassFilter({ id: `${family}-lp`, family, order: 4, frequency: 80 });
    const highPass = new HighPassFilter({ id: `${family}-hp`, family, order: 4, frequency: 80 });
    close(Complex.magnitude(lowPass.evaluate(80)), Math.SQRT1_2, 1e-6);
    close(Complex.magnitude(highPass.evaluate(80)), Math.SQRT1_2, 1e-6);
  }
  const linkwitzRiley = new LowPassFilter({ id: 'lr-lp', family: 'LinkwitzRiley', order: 4, frequency: 80 });
  close(Complex.magnitude(linkwitzRiley.evaluate(80)), .5, 1e-6);
});

test('parametric EQ reaches the configured gain at center frequency', () => {
  const peq = new ParametricEQ({ id: 'peq', frequency: 60, gain: 9, q: 2 });
  close(Complex.magnitude(peq.evaluate(60)), 10 ** (9 / 20));
  close(Complex.magnitude(peq.evaluate(.0001)), 1, 1e-6);
});

test('speaker response and signal chain are applied together', () => {
  const speaker = new Speaker({
    id: 'sub',
    frequencyResponse: [[20, -6], [80, 0]],
    signalChain: new SignalChain({ processors: [new Gain({ id: 'gain', db: 6 })] }),
  });
  close(Complex.magnitude(speaker.transferAt(20)), 1);
  close(Complex.magnitude(speaker.transferAt(80)), 10 ** (6 / 20));
});

test('crossover routes sum parallel route transfers per speaker', () => {
  const speaker = new Speaker({ id: 'sub' });
  const network = new CrossoverNetwork({ routes: [
    { id: 'a', targets: [speaker], signalChain: new SignalChain({ processors: [new Gain({ id: 'a-gain', db: 0 })] }) },
    { id: 'b', targets: [speaker], signalChain: new SignalChain({ processors: [new Gain({ id: 'b-gain', db: -6 })] }) },
  ] });
  close(Complex.magnitude(network.transferFor(speaker, 80)), 1 + 10 ** (-6 / 20));
});
