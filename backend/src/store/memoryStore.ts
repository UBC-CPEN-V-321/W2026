import { randomUUID } from 'node:crypto';

import type { FieldDefinition } from '../models/fieldDefinition';
import type { Listing } from '../models/listing';
import type { Option } from '../models/option';
import type { BuyerRequest } from '../models/request';
import type { FieldRepo, OptionRepo, PostDoc, PostRepo, Store } from './types';

class MemoryPostRepo<T extends PostDoc & { category: string }> implements PostRepo<T> {
  private readonly docs = new Map<string, T>();

  async insert(doc: Omit<T, 'id'>): Promise<T> {
    const stored = { ...doc, id: randomUUID() } as T;
    this.docs.set(stored.id, stored);
    return structuredClone(stored);
  }

  async findById(id: string): Promise<T | null> {
    const doc = this.docs.get(id);
    return doc === undefined ? null : structuredClone(doc);
  }

  async listByOwner(ownerId: string): Promise<T[]> {
    return [...this.docs.values()]
      .filter((d) => d.ownerId === ownerId)
      .map((d) => structuredClone(d));
  }

  async replace(doc: T): Promise<void> {
    this.docs.set(doc.id, structuredClone(doc));
  }

  async remove(id: string): Promise<void> {
    this.docs.delete(id);
  }

  async countByCategory(category: string): Promise<number> {
    return [...this.docs.values()].filter((d) => d.category === category).length;
  }
}

class MemoryOptionRepo implements OptionRepo {
  private readonly options = new Map<string, Option>();

  private static id(field: string, key: string): string {
    return `${field}\u0000${key}`;
  }

  async list(field: string): Promise<Option[]> {
    return [...this.options.values()]
      .filter((o) => o.field === field)
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  async find(field: string, key: string): Promise<Option | null> {
    return this.options.get(MemoryOptionRepo.id(field, key)) ?? null;
  }

  async ensure(option: Option): Promise<Option> {
    const id = MemoryOptionRepo.id(option.field, option.key);
    const existing = this.options.get(id);
    if (existing !== undefined) {
      return existing;
    }
    this.options.set(id, option);
    return option;
  }
}

class MemoryFieldRepo implements FieldRepo {
  private readonly defs = new Map<string, FieldDefinition>();

  private static id(ownerId: string, key: string): string {
    return `${ownerId}\u0000${key}`;
  }

  async list(ownerId: string): Promise<FieldDefinition[]> {
    return [...this.defs.values()].filter((d) => d.ownerId === ownerId);
  }

  async upsert(def: FieldDefinition): Promise<FieldDefinition> {
    this.defs.set(MemoryFieldRepo.id(def.ownerId, def.key), def);
    return def;
  }

  async remove(ownerId: string, key: string): Promise<boolean> {
    return this.defs.delete(MemoryFieldRepo.id(ownerId, key));
  }
}

export function createMemoryStore(): Store {
  return {
    listings: new MemoryPostRepo<Listing>(),
    requests: new MemoryPostRepo<BuyerRequest>(),
    options: new MemoryOptionRepo(),
    fields: new MemoryFieldRepo(),
    close: async () => undefined,
  };
}
