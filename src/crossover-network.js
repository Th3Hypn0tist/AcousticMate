import { Complex } from './complex.js';

function targetContainsSpeaker(target, speaker) {
  if (target === speaker) return true;
  return Array.isArray(target?.members) && target.members.some(member => member?.speaker === speaker);
}

class CrossoverNetwork {
  constructor({ routes = [] } = {}) {
    this.routes = new Map();
    for (const route of routes) this.addRoute(route);
  }
  addRoute({ id, targets = [], signalChain }) {
    if (typeof id !== 'string' || !id) throw new Error('Crossover route requires a non-empty id');
    if (this.routes.has(id)) throw new Error(`Crossover route already exists: ${id}`);
    if (!signalChain || typeof signalChain.evaluateFrequencyResponse !== 'function') throw new Error('Crossover route requires a SignalChain');
    const route = { id, targets: new Set(targets), signalChain };
    this.routes.set(id, route);
    return route;
  }
  removeRoute(ref) { const id = typeof ref === 'string' ? ref : ref?.id; const route = this.routes.get(id) ?? null; this.routes.delete(id); return route; }
  route(ref) { const id = typeof ref === 'string' ? ref : ref?.id; const route = this.routes.get(id); if (!route) throw new Error('Crossover route not found'); return route; }
  assignSpeaker(routeRef, speaker) { this.route(routeRef).targets.add(speaker); return this; }
  unassignSpeaker(routeRef, speaker) { this.route(routeRef).targets.delete(speaker); return this; }
  assignSpeakerSet(routeRef, speakerSet) { this.route(routeRef).targets.add(speakerSet); return this; }
  unassignSpeakerSet(routeRef, speakerSet) { this.route(routeRef).targets.delete(speakerSet); return this; }
  setSignalChain(routeRef, signalChain) {
    if (!signalChain || typeof signalChain.evaluateFrequencyResponse !== 'function') throw new Error('Crossover route requires a SignalChain');
    this.route(routeRef).signalChain = signalChain;
    return this;
  }
  transferFor(speaker, frequencyHz) {
    const matches = [...this.routes.values()].filter(route => [...route.targets].some(target => targetContainsSpeaker(target, speaker)));
    if (!matches.length) return [1, 0];
    return matches.reduce((sum, route) => Complex.add(sum, route.signalChain.evaluateFrequencyResponse(frequencyHz)), [0, 0]);
  }
}

export { CrossoverNetwork, targetContainsSpeaker };
