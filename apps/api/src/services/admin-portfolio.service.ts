
import {
  asc,
  count,
  desc,
  eq,
} from 'drizzle-orm';

import {
  db,
  adminUsers,
  projects,
  projectImages,
  skills,
  experience,
  education,
  certifications,
  achievements,
  profiles,
  socialLinks,
} from '@yatin-portfolio/database';

import { ApiError } from '../lib/errors/api-error.js';
import { normalizeProfileExperience } from '../lib/profile-values.js';
import { logAdminAudit } from './admin-audit.service.js';
import { deleteMediaMappingsForOwner } from './media-mapping.service.js';

interface AuditMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

interface AdminContext extends AuditMetadata {
  adminId: string;
}

type CompleteRecordValidator = (
  existing: object,
  updates: Record<string, unknown>,
) => Record<string, unknown>;

type ResourceName =
  | 'project'
  | 'skill'
  | 'experience'
  | 'education'
  | 'certification'
  | 'achievement'
  | 'profile'
  | 'social_link';

const resourceTables = {
  projects,
  skills,
  experience,
  education,
  certifications,
  achievements,
  socialLinks,
} as const;

type CollectionName = keyof typeof resourceTables;
type PortfolioTable = (typeof resourceTables)[CollectionName];

function tableFor(resource: CollectionName): PortfolioTable {
  return resourceTables[resource];
}

function auditInput(
  admin: AdminContext,
  resource: ResourceName,
  action: string,
  entityId: string | null,
  oldValues?: Record<string, unknown> | null,
  newValues?: Record<string, unknown> | null,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
) {
  return logAdminAudit({
    adminId: admin.adminId,
    action: `admin.portfolio.${resource}.${action}`,
    entityType: resource,
    entityId,
    description: `Administrator ${action}d ${resource.replace('_', ' ')}.`,
    oldValues,
    newValues,
    ipAddress: admin.ipAddress,
    userAgent: admin.userAgent,
  }, tx);
}

function notFound(resource: string): never {
  throw new ApiError(
    404,
    'PORTFOLIO_RESOURCE_NOT_FOUND',
    `${resource} was not found.`,
  );
}

function validateId(id: string): void {
  if (!id) {
    throw new ApiError(400, 'INVALID_ID', 'A valid ID is required.');
  }
}

export async function listPortfolioResource(
  resource: CollectionName,
  page: number,
  limit: number,
) {
  const table = tableFor(resource);
  const offset = (page - 1) * limit;

  const [items, totals] = await Promise.all([
    db
      .select()
      .from(table)
      .orderBy(asc(table.displayOrder), desc(table.createdAt))
      .limit(limit)
      .offset(offset),

    db.select({ total: count() }).from(table),
  ]);

  const total = Number(totals[0]?.total ?? 0);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: offset + items.length < total,
      hasPreviousPage: page > 1,
    },
  };
}

export async function getPortfolioResource(
  resource: CollectionName,
  id: string,
) {
  validateId(id);

  const table = tableFor(resource);
  const [item] = await db
    .select()
    .from(table)
    .where(eq(table.id, id))
    .limit(1);

  if (!item) notFound(resource);

  if (resource === 'projects') {
    const images = await db
      .select()
      .from(projectImages)
      .where(eq(projectImages.projectId, id))
      .orderBy(asc(projectImages.displayOrder));

    return { ...item, images };
  }

  return item;
}

export async function createPortfolioResource(
  resource: CollectionName,
  values: Record<string, unknown>,
  admin: AdminContext,
) {
  const table = tableFor(resource);

  const created = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(table)
      .values({
        ...values,
        updatedAt: new Date(),
      })
      .returning();
    const result = Array.isArray(inserted) ? inserted[0] : undefined;

    if (!result) {
      throw new ApiError(
        500,
        'PORTFOLIO_CREATE_FAILED',
        'Unable to create the portfolio resource.',
      );
    }

    await auditInput(
      admin,
      resource as ResourceName,
      'create',
      result.id,
      undefined,
      result,
      tx,
    );

    return result;
  });

  return created;
}

export async function updatePortfolioResource(
  resource: CollectionName,
  id: string,
  values: Record<string, unknown>,
  admin: AdminContext,
  validateCompleteRecord: CompleteRecordValidator,
) {
  validateId(id);

  const table = tableFor(resource);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(table)
      .where(eq(table.id, id))
      .for('update')
      .limit(1);

    if (!existing) notFound(resource);

    const completeValues = validateCompleteRecord(
      existing,
      values,
    );

    const [updated] = await tx
      .update(table)
      .set({
        ...completeValues,
        updatedAt: new Date(),
      })
      .where(eq(table.id, id))
      .returning();

    if (!updated) {
      throw new ApiError(
        500,
        'PORTFOLIO_UPDATE_FAILED',
        'Unable to update the portfolio resource.',
      );
    }

    await auditInput(
      admin,
      resource as ResourceName,
      'update',
      id,
      existing,
      updated,
      tx,
    );

    return updated;
  });
}

export async function deletePortfolioResource(
  resource: CollectionName,
  id: string,
  admin: AdminContext,
): Promise<void> {
  validateId(id);

  const table = tableFor(resource);

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(table)
      .where(eq(table.id, id))
      .for('update')
      .limit(1);

    if (!existing) notFound(resource);

    const mediaOwnerType: Partial<Record<CollectionName, 'project' | 'skill' | 'experience' | 'education' | 'certification' | 'achievement'>> = {
      projects: 'project',
      skills: 'skill',
      experience: 'experience',
      education: 'education',
      certifications: 'certification',
      achievements: 'achievement',
    };
    const ownerType = mediaOwnerType[resource];

    if (ownerType) {
      await deleteMediaMappingsForOwner(tx, ownerType, id);
    }

    await tx.delete(table).where(eq(table.id, id));

    await auditInput(
      admin,
      resource as ResourceName,
      'delete',
      id,
      existing,
      undefined,
      tx,
    );
  });
}

export async function replaceProjectImages(
  projectId: string,
  images: Array<{
    imageUrl: string;
    altText: string;
    caption?: string | null;
    displayOrder: number;
  }>,
  admin: AdminContext,
) {
  validateId(projectId);

  return db.transaction(async (tx) => {
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for('update')
      .limit(1);

    if (!project) notFound('Project');

    const previousImages = await tx
      .select()
      .from(projectImages)
      .where(eq(projectImages.projectId, projectId));

    await tx
      .delete(projectImages)
      .where(eq(projectImages.projectId, projectId));

    const insertedImages = images.length === 0
      ? []
      : await tx
        .insert(projectImages)
        .values(
          images.map((image) => ({
            projectId,
            imageUrl: image.imageUrl,
            altText: image.altText,
            caption: image.caption ?? null,
            displayOrder: image.displayOrder,
          })),
        )
        .returning();

    await auditInput(
      admin,
      'project',
      'images_update',
      projectId,
      { images: previousImages },
      { images: insertedImages },
      tx,
    );

    return insertedImages;
  });
}

export async function getAdminProfile() {
  const [profile] = await db
    .select()
    .from(profiles)
    .limit(1);

  return profile ? normalizeProfileExperience(profile) : null;
}

export async function saveAdminProfile(
  values: Record<string, unknown>,
  admin: AdminContext,
) {
  return db.transaction(async (tx) => {
    const [adminUser] = await tx
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(eq(adminUsers.id, admin.adminId))
      .for('update')
      .limit(1);

    if (!adminUser) {
      throw new ApiError(
        404,
        'ADMIN_NOT_FOUND',
        'The administrator account was not found.',
      );
    }

    const [existing] = await tx
      .select()
      .from(profiles)
      .for('update')
      .limit(1);

    if (!existing) {
      const [created] = await tx
        .insert(profiles)
        .values(values as typeof profiles.$inferInsert)
        .returning();

      if (!created) {
        throw new ApiError(
          500,
          'PROFILE_CREATE_FAILED',
          'Unable to create the profile.',
        );
      }

      await auditInput(
        admin,
        'profile',
        'create',
        created.id,
        undefined,
        created,
        tx,
      );

      return normalizeProfileExperience(created);
    }

    const [updated] = await tx
      .update(profiles)
      .set({
        ...values,
        updatedAt: new Date(),
      } as Partial<typeof profiles.$inferInsert>)
      .where(eq(profiles.id, existing.id))
      .returning();

    if (!updated) {
      throw new ApiError(
        500,
        'PROFILE_UPDATE_FAILED',
        'Unable to update the profile.',
      );
    }

    await auditInput(
      admin,
      'profile',
      'update',
      updated.id,
      existing,
      updated,
      tx,
    );

    return normalizeProfileExperience(updated);
  });
}

export async function getSocialLinksForAdmin() {
  return db
    .select()
    .from(socialLinks)
    .orderBy(asc(socialLinks.displayOrder), asc(socialLinks.platform));
}
