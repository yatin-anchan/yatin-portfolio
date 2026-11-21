
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

import { adminUsers } from './admin-users.js';

export const adminRecoveryCodes = pgTable(
  'admin_recovery_codes',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, {
        onDelete: 'cascade',
      }),

    codeHash: varchar('code_hash', {
      length: 64,
    }).notNull(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull().defaultNow(),

    usedAt: timestamp('used_at', {
      withTimezone: true,
      mode: 'date',
    }),
  },
  (table) => [
    uniqueIndex('admin_recovery_codes_hash_unique')
      .on(table.codeHash),

    index('admin_recovery_codes_user_id_idx')
      .on(table.adminUserId),
  ],
);
