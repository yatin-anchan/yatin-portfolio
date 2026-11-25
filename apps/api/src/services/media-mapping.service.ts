
import {
  and,
  desc,
  eq,
} from 'drizzle-orm';

import {
  db,
  mapping,
  projects,
  skills,
  experience,
  education,
  certifications,
  achievements,
  profiles,
} from '@yatin-portfolio/database';

import { ApiError } from '../lib/errors/api-error.js';
import { logAdminAudit } from './admin-audit.service.js';

type MappingTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export type MediaOwnerType =
  | 'project'
  | 'skill'
  | 'experience'
  | 'education'
  | 'certification'
  | 'achievement'
  | 'profile';

const MEDIA_OWNER_TYPES: readonly MediaOwnerType[] = [
  'project',
  'skill',
  'experience',
  'education',
  'certification',
  'achievement',
  'profile',
];

function isMediaOwnerType(value: string): value is MediaOwnerType {
  return MEDIA_OWNER_TYPES.some((type) => type === value);
}

export interface CreateMediaMappingInput {
  fid: string;
  type: MediaOwnerType;
  url: string;
  mediaType: 'image' | 'document' | 'video' | 'audio' | 'other';
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  altText?: string | null;
  caption?: string | null;
  storageProvider?: string | null;
  storageKey?: string | null;
  externalUrl?: string | null;
  isPrimary?: boolean;
  isVisible?: boolean;
}

export type UpdateMediaMappingInput = Partial<
  Omit<CreateMediaMappingInput, 'fid' | 'type'>
>;

async function ownerExists(
  type: MediaOwnerType,
  fid: string,
  publishedOnly = false,
): Promise<boolean> {
  switch (type) {
    case 'project': {
      const conditions = publishedOnly
        ? and(eq(projects.id, fid), eq(projects.isPublished, true))
        : eq(projects.id, fid);

      const [result] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(conditions)
        .limit(1);

      return Boolean(result);
    }

    case 'skill': {
      const conditions = publishedOnly
        ? and(eq(skills.id, fid), eq(skills.isPublished, true))
        : eq(skills.id, fid);

      const [result] = await db
        .select({ id: skills.id })
        .from(skills)
        .where(conditions)
        .limit(1);

      return Boolean(result);
    }

    case 'experience': {
      const conditions = publishedOnly
        ? and(eq(experience.id, fid), eq(experience.isPublished, true))
        : eq(experience.id, fid);

      const [result] = await db
        .select({ id: experience.id })
        .from(experience)
        .where(conditions)
        .limit(1);

      return Boolean(result);
    }

    case 'education': {
      const conditions = publishedOnly
        ? and(eq(education.id, fid), eq(education.isPublished, true))
        : eq(education.id, fid);

      const [result] = await db
        .select({ id: education.id })
        .from(education)
        .where(conditions)
        .limit(1);

      return Boolean(result);
    }

    case 'certification': {
      const conditions = publishedOnly
        ? and(
            eq(certifications.id, fid),
            eq(certifications.isPublished, true),
          )
        : eq(certifications.id, fid);

      const [result] = await db
        .select({ id: certifications.id })
        .from(certifications)
        .where(conditions)
        .limit(1);

      return Boolean(result);
    }

    case 'achievement': {
      const conditions = publishedOnly
        ? and(
            eq(achievements.id, fid),
            eq(achievements.isPublished, true),
          )
        : eq(achievements.id, fid);

      const [result] = await db
        .select({ id: achievements.id })
        .from(achievements)
        .where(conditions)
        .limit(1);

      return Boolean(result);
    }

    case 'profile': {
      const [result] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.id, fid))
        .limit(1);

      return Boolean(result);
    }
  }
}

async function requireOwner(
  type: MediaOwnerType,
  fid: string,
): Promise<void> {
  if (!(await ownerExists(type, fid))) {
    throw new ApiError(
      404,
      'MEDIA_OWNER_NOT_FOUND',
      'The portfolio record associated with this media was not found.',
    );
  }
}

async function lockMediaOwner(
  tx: MappingTransaction,
  type: MediaOwnerType,
  fid: string,
): Promise<boolean> {
  switch (type) {
    case 'project': {
      const [owner] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, fid))
        .for('update')
        .limit(1);
      return Boolean(owner);
    }
    case 'skill': {
      const [owner] = await tx
        .select({ id: skills.id })
        .from(skills)
        .where(eq(skills.id, fid))
        .for('update')
        .limit(1);
      return Boolean(owner);
    }
    case 'experience': {
      const [owner] = await tx
        .select({ id: experience.id })
        .from(experience)
        .where(eq(experience.id, fid))
        .for('update')
        .limit(1);
      return Boolean(owner);
    }
    case 'education': {
      const [owner] = await tx
        .select({ id: education.id })
        .from(education)
        .where(eq(education.id, fid))
        .for('update')
        .limit(1);
      return Boolean(owner);
    }
    case 'certification': {
      const [owner] = await tx
        .select({ id: certifications.id })
        .from(certifications)
        .where(eq(certifications.id, fid))
        .for('update')
        .limit(1);
      return Boolean(owner);
    }
    case 'achievement': {
      const [owner] = await tx
        .select({ id: achievements.id })
        .from(achievements)
        .where(eq(achievements.id, fid))
        .for('update')
        .limit(1);
      return Boolean(owner);
    }
    case 'profile': {
      const [owner] = await tx
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.id, fid))
        .for('update')
        .limit(1);
      return Boolean(owner);
    }
  }
}

export async function deleteMediaMappingsForOwner(
  tx: MappingTransaction,
  type: MediaOwnerType,
  fid: string,
): Promise<void> {
  await tx
    .delete(mapping)
    .where(and(eq(mapping.type, type), eq(mapping.fid, fid)));
}

export async function findPublicMediaMappings(
  type: MediaOwnerType,
  fid: string,
) {
  const published = await ownerExists(type, fid, true);

  if (!published) {
    return [];
  }

  return db
    .select({
      id: mapping.id,
      fid: mapping.fid,
      type: mapping.type,
      url: mapping.url,
      mediaType: mapping.mediaType,
      mimeType: mapping.mimeType,
      fileName: mapping.fileName,
      altText: mapping.altText,
      caption: mapping.caption,
      isPrimary: mapping.isPrimary,
      createdAt: mapping.createdAt,
    })
    .from(mapping)
    .where(
      and(
        eq(mapping.type, type),
        eq(mapping.fid, fid),
        eq(mapping.isVisible, true),
      ),
    )
    .orderBy(desc(mapping.isPrimary), desc(mapping.createdAt));
}

export async function findAdminMediaMappings(
  type: MediaOwnerType,
  fid: string,
) {
  await requireOwner(type, fid);

  return db
    .select()
    .from(mapping)
    .where(
      and(
        eq(mapping.type, type),
        eq(mapping.fid, fid),
      ),
    )
    .orderBy(desc(mapping.isPrimary), desc(mapping.createdAt));
}

export async function createMediaMapping(
  input: CreateMediaMappingInput,
  adminId: string,
  ipAddress: string | null,
  userAgent: string | null,
) {
  const isPrimary = input.isPrimary ?? false;

  const created = await db.transaction(async (tx) => {
    if (!(await lockMediaOwner(tx, input.type, input.fid))) {
      throw new ApiError(
        404,
        'MEDIA_OWNER_NOT_FOUND',
        'The portfolio record associated with this media was not found.',
      );
    }

    if (isPrimary) {
      await tx
        .update(mapping)
        .set({
          isPrimary: false,
          updatedAt: new Date(),
          updatedBy: adminId,
        })
        .where(
          and(
            eq(mapping.type, input.type),
            eq(mapping.fid, input.fid),
            eq(mapping.isPrimary, true),
          ),
        );
    }

    const [result] = await tx
      .insert(mapping)
      .values({
        ...input,
        mimeType: input.mimeType ?? null,
        fileName: input.fileName ?? null,
        fileSize: input.fileSize ?? null,
        altText: input.altText ?? null,
        caption: input.caption ?? null,
        storageProvider: input.storageProvider ?? null,
        storageKey: input.storageKey ?? null,
        externalUrl: input.externalUrl ?? null,
        isPrimary,
        isVisible: input.isVisible ?? true,
        createdBy: adminId,
        updatedBy: adminId,
      })
      .returning();

    if (!result) {
      throw new ApiError(
        500,
        'MEDIA_MAPPING_CREATE_FAILED',
        'Unable to create the media mapping.',
      );
    }

    await logAdminAudit({
      adminId,
      action: 'media_mapping.created',
      entityType: 'media_mapping',
      entityId: result.id,
      description: `Media mapping created for ${input.type}/${input.fid}.`,
      newValues: {
        type: result.type,
        fid: result.fid,
        mediaType: result.mediaType,
        isPrimary: result.isPrimary,
        isVisible: result.isVisible,
      },
      ipAddress,
      userAgent,
    }, tx);

    return result;
  });

  return created;
}

export async function updateMediaMapping(
  id: string,
  input: UpdateMediaMappingInput,
  adminId: string,
  ipAddress: string | null,
  userAgent: string | null,
) {
  const [existing] = await db
    .select()
    .from(mapping)
    .where(eq(mapping.id, id))
    .limit(1);

  if (!existing) {
    return null;
  }

  if (!isMediaOwnerType(existing.type)) {
    throw new ApiError(
      409,
      'INVALID_MEDIA_OWNER_TYPE',
      'The media mapping has an unsupported owner type.',
    );
  }
  const ownerType = existing.type;

  const updates = {
    ...input,
    updatedAt: new Date(),
    updatedBy: adminId,
  };

  const updated = await db.transaction(async (tx) => {
    if (!(await lockMediaOwner(tx, ownerType, existing.fid))) {
      return null;
    }

    const [lockedMapping] = await tx
      .select()
      .from(mapping)
      .where(eq(mapping.id, id))
      .for('update')
      .limit(1);

    if (!lockedMapping) {
      return null;
    }

    if (input.isPrimary === true) {
      await tx
        .update(mapping)
        .set({
          isPrimary: false,
          updatedAt: new Date(),
          updatedBy: adminId,
        })
        .where(
          and(
            eq(mapping.type, existing.type),
            eq(mapping.fid, existing.fid),
            eq(mapping.isPrimary, true),
          ),
        );
    }

    const [result] = await tx
      .update(mapping)
      .set(updates)
      .where(eq(mapping.id, id))
      .returning();

    if (!result) return null;

    await logAdminAudit({
      adminId,
      action: 'media_mapping.updated',
      entityType: 'media_mapping',
      entityId: result.id,
      description: 'Media mapping updated.',
      oldValues: {
        isPrimary: lockedMapping.isPrimary,
        isVisible: lockedMapping.isVisible,
        mediaType: lockedMapping.mediaType,
      },
      newValues: {
        isPrimary: result.isPrimary,
        isVisible: result.isVisible,
        mediaType: result.mediaType,
      },
      ipAddress,
      userAgent,
    }, tx);

    return result;
  });

  return updated;
}

export async function deleteMediaMapping(
  id: string,
  adminId: string,
  ipAddress: string | null,
  userAgent: string | null,
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(mapping)
      .where(eq(mapping.id, id))
      .for('update')
      .limit(1);

    if (!existing) return null;

    const [deleted] = await tx
      .delete(mapping)
      .where(eq(mapping.id, id))
      .returning({ id: mapping.id });

    if (!deleted) return null;

    await logAdminAudit({
      adminId,
      action: 'media_mapping.deleted',
      entityType: 'media_mapping',
      entityId: existing.id,
      description: 'Media mapping deleted. The stored media asset was not deleted.',
      oldValues: {
        type: existing.type,
        fid: existing.fid,
        mediaType: existing.mediaType,
        isPrimary: existing.isPrimary,
      },
      ipAddress,
      userAgent,
    }, tx);

    return existing;
  });
}
