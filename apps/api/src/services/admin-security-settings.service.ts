
import { eq } from 'drizzle-orm';

import {
  db,
  adminSecuritySettings,
} from '@yatin-portfolio/database';

import { ApiError } from '../lib/errors/api-error.js';
import { logAdminAudit } from './admin-audit.service.js';

export interface AdminSecurityPreferences {
  requireDualVerification: boolean;
  loginNotificationEnabled: boolean;
  securityNotificationEnabled: boolean;
}

export type AdminSecurityPreferencesUpdate =
  Partial<AdminSecurityPreferences>;

export async function getAdminSecuritySettings(
  adminUserId: string,
): Promise<AdminSecurityPreferences> {
  const [settings] = await db
    .select({
      requireDualVerification:
        adminSecuritySettings.requireDualVerification,
      loginNotificationEnabled:
        adminSecuritySettings.loginNotificationEnabled,
      securityNotificationEnabled:
        adminSecuritySettings.securityNotificationEnabled,
    })
    .from(adminSecuritySettings)
    .where(
      eq(adminSecuritySettings.adminUserId, adminUserId),
    )
    .limit(1);

  if (!settings) {
    throw new ApiError(
      404,
      'SECURITY_SETTINGS_NOT_FOUND',
      'Administrator security settings were not found.',
    );
  }

  return settings;
}

export async function updateAdminSecuritySettings(
  adminUserId: string,
  updates: AdminSecurityPreferencesUpdate,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<AdminSecurityPreferences> {
  if (Object.keys(updates).length === 0) {
    throw new ApiError(
      400,
      'EMPTY_SECURITY_SETTINGS_UPDATE',
      'At least one security preference is required.',
    );
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: adminSecuritySettings.id,
        requireDualVerification:
          adminSecuritySettings.requireDualVerification,
        loginNotificationEnabled:
          adminSecuritySettings.loginNotificationEnabled,
        securityNotificationEnabled:
          adminSecuritySettings.securityNotificationEnabled,
      })
      .from(adminSecuritySettings)
      .where(
        eq(adminSecuritySettings.adminUserId, adminUserId),
      )
      .for('update')
      .limit(1);

    if (!existing) {
      throw new ApiError(
        404,
        'SECURITY_SETTINGS_NOT_FOUND',
        'Administrator security settings were not found.',
      );
    }

    const [updated] = await tx
      .update(adminSecuritySettings)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(
        eq(adminSecuritySettings.id, existing.id),
      )
      .returning({
        requireDualVerification:
          adminSecuritySettings.requireDualVerification,
        loginNotificationEnabled:
          adminSecuritySettings.loginNotificationEnabled,
        securityNotificationEnabled:
          adminSecuritySettings.securityNotificationEnabled,
      });

    if (!updated) {
      throw new ApiError(
        500,
        'SECURITY_SETTINGS_UPDATE_FAILED',
        'Unable to update administrator security settings.',
      );
    }

    const changedFields = Object.keys(updates);

    const oldValues = Object.fromEntries(
      changedFields.map((key) => [
        key,
        existing[key as keyof typeof existing],
      ]),
    );

    await logAdminAudit(
      {
        adminId: adminUserId,
        action: 'admin.security_settings_updated',
        entityType: 'admin_security_settings',
        entityId: existing.id,
        description:
          'Administrator updated security preferences.',
        oldValues,
        newValues: updates,
        ipAddress,
        userAgent,
      },
      tx,
    );

    return updated;
  });
}
