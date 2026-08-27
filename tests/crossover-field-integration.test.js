import test from 'node:test';
import assert from 'node:assert/strict';
import { CrossoverNetwork } from '../src/crossover-network.js';
import { RectangularRoomField } from '../src/rectangular-room-field.js';
import { SignalChain } from '../src/signal-chain.js';
import { Gain } from '../src/signal-processors.js';

test('RectangularRoomField multiplies speaker transfer by matching crossover route', () => {
  const speaker = {
    id: 'speaker-1',
    enabled: true,
    position: [1, 1, 1],
    transferAt() { return [1, 0]; },
    directivityGain() { return 1; },
  };
  const gain = new Gain({ id: 'route-gain', db: -6.020599913279624 });
  const network = new CrossoverNetwork({ routes: [{ id: 'route', targets: [speaker], signalChain: new SignalChain({ processors: [gain] }) }] });
  const field = new RectangularRoomField({ dimensions: { width: 6, height: 2.7, depth: 4.5 }, speakers: [speaker], crossoverNetwork: network, maxFrequency: 100 });
  const transfer = field.speakerTransferAt(speaker, 50);
  assert.ok(Math.abs(transfer[0] - .5) < 1e-9);
  assert.ok(Math.abs(transfer[1]) < 1e-12);
});

test('SpeakerSet crossover target applies route to each member speaker', () => {
  const speaker = { id: 'speaker-1' };
  const set = { members: [{ speaker }] };
  const network = new CrossoverNetwork();
  network.addRoute({ id: 'set-route', targets: [set], signalChain: new SignalChain({ processors: [new Gain({ id: 'gain', db: -6.020599913279624 })] }) });
  const transfer = network.transferFor(speaker, 100);
  assert.ok(Math.abs(transfer[0] - .5) < 1e-9);
});
