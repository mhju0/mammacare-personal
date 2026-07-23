import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// name/birthdate are optional (owner decision 2026-07-23): the app never uses
// them for logic — they only decorate the exported doctor report, so first
// launch no longer blocks on a setup form. The row itself is created by seed.
export const baby = sqliteTable('baby', {
  id: text('id').primaryKey(),
  name: text('name'),
  birthdate: integer('birthdate', { mode: 'timestamp' }),
  defaultWindowDays: integer('default_window_days').notNull().default(3),
});

export const food = sqliteTable('food', {
  id: text('id').primaryKey(), // catalog slug (e.g. 'egg') or uuid for custom
  name: text('name').notNull(), // i18n key ('foodName.egg') or raw custom text
  isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
  allergenGroup: text('allergen_group'), // 'egg'|'milk'|...|null; non-null = high-risk badge
});

export const trial = sqliteTable('trial', {
  id: text('id').primaryKey(),
  foodId: text('food_id').notNull().references(() => food.id),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  windowDays: integer('window_days').notNull(),
  outcome: text('outcome', { enum: ['safe', 'reacted', 'cancelled'] }), // null = active
  endedAt: integer('ended_at', { mode: 'timestamp' }),
});

export const reaction = sqliteTable('reaction', {
  id: text('id').primaryKey(),
  trialId: text('trial_id').notNull().references(() => trial.id),
  symptoms: text('symptoms', { mode: 'json' }).$type<string[]>().notNull(),
  severity: text('severity', { enum: ['mild', 'moderate', 'severe'] }).notNull(),
  occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
  note: text('note'),
});

export const checkin = sqliteTable('checkin', {
  id: text('id').primaryKey(),
  trialId: text('trial_id').notNull().references(() => trial.id),
  occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
  note: text('note'),
});

export type Baby = typeof baby.$inferSelect;
export type Food = typeof food.$inferSelect;
export type Trial = typeof trial.$inferSelect;
export type Reaction = typeof reaction.$inferSelect;
export type Checkin = typeof checkin.$inferSelect;
