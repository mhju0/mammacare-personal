// Foods removed from CATALOG (e.g. greenbean, dropped 2026-07) linger in DBs
// seeded by older builds and render as raw i18n keys. seedIfEmpty must
// reconcile: delete seeded (non-custom) foods no longer in the catalog, but
// never ones with trial history. Asserted on the generated SQL via a
// capturing sqlite-proxy driver, per the no-incidental-behavior test rule.
const mockCaptured: { sql: string; params: unknown[] }[] = [];
// false = demo-seeded fresh install (custom 퀴노아 only, no catalog rows);
// true = catalog already seeded (upgrade path → reconcile branch).
let mockCatalogSeeded = false;

jest.mock('./client', () => {
  const { drizzle } = jest.requireActual('drizzle-orm/sqlite-proxy');
  return {
    db: drizzle(async (sql: string, params: unknown[]) => {
      mockCaptured.push({ sql, params });
      const q = sql.trim().toLowerCase();
      if (!q.startsWith('select')) return { rows: [] };
      // A food query filtering on is_custom sees catalog rows only when
      // mockCatalogSeeded; an unfiltered one always sees the custom 퀴노아 row.
      if (q.includes('from "food"')) {
        return q.includes('"is_custom"') ? { rows: mockCatalogSeeded ? [['egg']] : [] } : { rows: [['quinoa']] };
      }
      return { rows: [['b1']] }; // baby row always exists
    }),
  };
});

import { seedIfEmpty } from './seed';
import { CATALOG } from './catalog';

test('seedIfEmpty seeds the catalog even when only custom foods exist (demo seeds 퀴노아 first)', async () => {
  mockCaptured.length = 0;
  mockCatalogSeeded = false;
  await seedIfEmpty();
  const ins = mockCaptured.find((c) => c.sql.toLowerCase().startsWith('insert into "food"'));
  expect(ins).toBeDefined(); // regression: an existing custom row must not suppress catalog seeding
  for (const c of CATALOG) expect(ins!.params).toContain(c.id);
});

test('seedIfEmpty deletes catalog-removed seeded foods without trial history', async () => {
  mockCaptured.length = 0;
  mockCatalogSeeded = true;
  await seedIfEmpty();
  const del = mockCaptured.find((c) => c.sql.toLowerCase().startsWith('delete'));
  expect(del).toBeDefined();
  const sql = del!.sql.toLowerCase();
  expect(sql).toContain('delete from "food"');
  expect(sql).toContain('"is_custom" = ?'); // custom foods are never touched
  expect(sql).toContain('not in'); // id not in catalog
  expect(sql).toContain('from "trial"'); // ...and not referenced by any trial
  for (const c of CATALOG) expect(del!.params).toContain(c.id); // full catalog is the keep-list
});
