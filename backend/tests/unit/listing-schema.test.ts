import { listingIndexes } from '../../src/models/listing';
import { requestIndexes } from '../../src/models/request';
import { createMemoryStore } from '../../src/store/memoryStore';
import { seedOptions } from '../../src/store/seed';
import {
  parseCategory,
  parseCondition,
  parseLocation,
  parsePhotoUrls,
  parsePrice,
} from '../../src/validation';

const PHOTO = 'https://storage.googleapis.com/bucket/photos/alice/1.jpg';

describe('listing field validation', () => {
  // Input: a complete set of valid listing fields
  // Expected behavior: every field is accepted and no errors are reported
  test('accepts valid values', () => {
    const errors: string[] = [];
    expect(parseCategory('Furniture', errors)).toBe('furniture');
    expect(parsePrice(100, 'price', errors)).toBe(100);
    expect(parseCondition('like new', 'condition', errors)).toBe('like new');
    expect(parseLocation({ longitude: -123.246, latitude: 49.26 }, errors).coordinates).toEqual([-123.246, 49.26]);
    expect(parsePhotoUrls([PHOTO], 1, errors)).toEqual([PHOTO]);
    expect(errors).toEqual([]);
  });

  // Input: missing category, negative price, unknown condition, out-of-range location, no photos
  // Expected behavior: one error is reported for each invalid field
  test('rejects invalid values', () => {
    const errors: string[] = [];
    parseCategory(undefined, errors);
    parsePrice(-1, 'price', errors);
    parseCondition('mint', 'condition', errors);
    parseLocation({ longitude: 500, latitude: 0 }, errors);
    parsePhotoUrls([], 1, errors);
    expect(errors).toHaveLength(5);
  });
});

describe('collection setup', () => {
  // Input: the index definitions for listings and requests
  // Expected behavior: location, owner and category lookups are all indexed
  test('defines location, owner and category indexes', () => {
    for (const indexes of [listingIndexes, requestIndexes]) {
      const keys = indexes.map((index) => Object.keys(index.key).join(','));
      expect(keys).toContain('location');
      expect(keys.some((key) => key.includes('ownerId'))).toBe(true);
      expect(keys.some((key) => key.includes('category'))).toBe(true);
    }
  });

  // Input: seeding the option lists twice
  // Expected behavior: built-in options are inserted once, so startup setup is safe to repeat
  test('seeding is idempotent', async () => {
    const store = createMemoryStore();
    await seedOptions(store);
    const first = (await store.options.list('category')).length;
    await seedOptions(store);
    expect((await store.options.list('category')).length).toBe(first);
    expect(first).toBeGreaterThan(0);
  });
});
