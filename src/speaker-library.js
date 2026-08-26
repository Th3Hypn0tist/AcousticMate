import { SpeakerModel } from './speaker-model.js';

class SpeakerLibrary {
  constructor({ models = [] } = {}) {
    this.models = new Map();
    for (const model of models) this.register(model);
  }

  register(value) {
    const model = value instanceof SpeakerModel ? value : new SpeakerModel(value);
    if (this.models.has(model.id)) throw new Error(`SpeakerModel already exists: ${model.id}`);
    this.models.set(model.id, model);
    return model;
  }

  replace(value) {
    const model = value instanceof SpeakerModel ? value : new SpeakerModel(value);
    this.models.set(model.id, model);
    return model;
  }

  remove(id) { return this.models.delete(String(id)); }
  get(id) { return this.models.get(String(id)) ?? null; }

  list({ manufacturer = null, type = null, category = null } = {}) {
    return [...this.models.values()].filter(model => {
      if (manufacturer != null && model.manufacturer !== manufacturer) return false;
      if (type != null && model.type !== type) return false;
      if (category != null && !model.categories.includes(category)) return false;
      return true;
    });
  }

  async loadDefinition(url, { fetcher = globalThis.fetch, replace = false } = {}) {
    if (typeof fetcher !== 'function') throw new Error('SpeakerLibrary loadDefinition requires fetch');
    const response = await fetcher(url);
    if (!response?.ok) throw new Error(`Failed to load SpeakerModel: ${response?.status ?? 'unknown status'}`);
    const definition = await response.json();
    return replace ? this.replace(definition) : this.register(definition);
  }
}

export { SpeakerLibrary };
