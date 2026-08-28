import test from 'node:test';
import assert from 'node:assert/strict';
import { CrossoverNetwork } from '../src/crossover-network.js';
import { DirectSoundField } from '../src/direct-sound-field.js';
import { RectangularRoomField } from '../src/rectangular-room-field.js';
import { SignalChain } from '../src/signal-chain.js';
import { Gain } from '../src/signal-processors.js';
import { Speaker } from '../src/speaker.js';
import { SpeakerSet } from '../src/speaker-set.js';

const HALF_GAIN_DB = -6.020599913279624;

function halfGainChain(id) {
  return new SignalChain({ processors: [new Gain({ id: `${id}-gain`, db: HALF_GAIN_DB })] });
}

test('RectangularRoomField multiplies speaker transfer by matching crossover route', () => {
  const speaker = {
    id: 'speaker-1',
    enabled: true,
    position: [1, 1, 1],
    transferAt() { return [1, 0]; },
    directivityGain() { return 1; },
  };
  const network = new CrossoverNetwork({ routes: [{ id: 'route', targets: [speaker], signalChain: halfGainChain('route') }] });
  const field = new RectangularRoomField({ dimensions: { width: 6, height: 2.7, depth: 4.5 }, speakers: [speaker], crossoverNetwork: network, maxFrequency: 100 });
  const transfer = field.speakerTransferAt(speaker, 50);
  assert.ok(Math.abs(transfer[0] - .5) < 1e-9);
  assert.ok(Math.abs(transfer[1]) < 1e-12);
});

test('SpeakerSet crossover target applies route to each member speaker', () => {
  const speaker = { id: 'speaker-1' };
  const set = { members: [{ speaker }] };
  const network = new CrossoverNetwork();
  network.addRoute({ id: 'set-route', targets: [set], signalChain: halfGainChain('set-route') });
  const transfer = network.transferFor(speaker, 100);
  assert.ok(Math.abs(transfer[0] - .5) < 1e-9);
});

test('modal and direct paths compose speaker, set, member trim and crossover exactly once', () => {
  const speaker = new Speaker({
    id: 'speaker',
    position: [1, 1, 1],
    signalChain: halfGainChain('speaker'),
  });
  const set = new SpeakerSet({
    id: 'set',
    signalChain: halfGainChain('set'),
    members: [{ speaker, gainTrimDb: HALF_GAIN_DB }],
  });
  const network = new CrossoverNetwork({
    routes: [{ id: 'route', targets: [set], signalChain: halfGainChain('route') }],
  });

  const modal = new RectangularRoomField({
    dimensions: { width: 6, height: 2.7, depth: 4.5 },
    speakers: [speaker],
    crossoverNetwork: network,
    maxFrequency: 100,
  });
  const direct = new DirectSoundField({ speakers: [], speakerSets: [set], crossoverNetwork: network });

  const expected = .5 ** 4;
  const modalTransfer = modal.speakerTransferAt(speaker, 50);
  const directTransfer = direct.speakerTransfer(speaker, 50);
  assert.ok(Math.abs(modalTransfer[0] - expected) < 1e-9);
  assert.ok(Math.abs(modalTransfer[1]) < 1e-12);
  assert.ok(Math.abs(directTransfer[0] - expected) < 1e-9);
  assert.ok(Math.abs(directTransfer[1]) < 1e-12);
});
