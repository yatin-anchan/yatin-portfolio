
import { asc, eq } from 'drizzle-orm';

import {
  db,
  siteSettings,
} from '@yatin-portfolio/database';

import { logAdminAudit } from './admin-audit.service.js';

export interface SiteSettingInput {
  value: unknown;
  description?: string | null;
  group?: string;
  isPublic?: boolean;
}

export async function findPublicSiteSettings() {
  return db
    .select({
      key: siteSettings.key,
      value: siteSettings.value,
      description: siteSettings.description,
      group: siteSettings.group,
    })
    .from(siteSettings)
    .where(eq(siteSettings.isPublic, true))
    .orderBy(asc(siteSettings.group), asc(siteSettings.key));
}

export async function findAllSiteSettings() {
  return db
    .select()
    .from(siteSettings)
    .orderBy(asc(siteSettings.group), asc(siteSettings.key));
}

export async function upsertSiteSetting(
  key: string,
  input: SiteSettingInput,
  adminId: string,
  ipAddress: string | null,
  userAgent: string | null,
) {
  const values = {
    value: input.value,
    description: input.description ?? null,
    group: input.group ?? 'general',
    isPublic: input.isPublic ?? false,
    updatedAt: new Date(),
    updatedBy: adminId,
  };

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: siteSettings.id,
        group: siteSettings.group,
        isPublic: siteSettings.isPublic,
      })
      .from(siteSettings)
      .where(eq(siteSettings.key, key))
      .for('update')
      .limit(1);

    const [setting] = await tx
      .insert(siteSettings)
      .values({
        key,
        ...values,
      })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: values,
      })
      .returning();

    if (!setting) {
      throw new Error('Unable to save site setting.');
    }

    await logAdminAudit({
      adminId,
      action: existing
        ? 'site_setting.updated'
        : 'site_setting.created',
      entityType: 'site_setting',
      entityId: setting.id,
      description: `Site setting "${key}" was ${existing ? 'updated' : 'created'}.`,
      oldValues: existing
        ? {
            group: existing.group,
            isPublic: existing.isPublic,
          }
        : null,
      newValues: {
        key,
        group: setting.group,
        isPublic: setting.isPublic,
      },
      ipAddress,
      userAgent,
    }, tx);

    return setting;
  });
}
