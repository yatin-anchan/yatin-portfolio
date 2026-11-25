
import {
  and,
  asc,
  desc,
  eq,
} from 'drizzle-orm';

import {
  db,
  pageContent,
} from '@yatin-portfolio/database';

import { logAdminAudit } from './admin-audit.service.js';

export interface PageContentInput {
  title?: string | null;
  subtitle?: string | null;
  content?: {
    version: 1;
    blocks: Array<Record<string, unknown>>;
  } | null;
  status?: 'draft' | 'published';
  isVisible?: boolean;
  displayOrder?: number;
}

export async function findPublishedPageContent(page: string) {
  return db
    .select({
      id: pageContent.id,
      page: pageContent.page,
      section: pageContent.section,
      title: pageContent.title,
      subtitle: pageContent.subtitle,
      content: pageContent.content,
      displayOrder: pageContent.displayOrder,
    })
    .from(pageContent)
    .where(
      and(
        eq(pageContent.page, page),
        eq(pageContent.status, 'published'),
        eq(pageContent.isVisible, true),
      ),
    )
    .orderBy(asc(pageContent.displayOrder));
}

export async function findAdminPageContent(page: string) {
  return db
    .select()
    .from(pageContent)
    .where(eq(pageContent.page, page))
    .orderBy(asc(pageContent.displayOrder), desc(pageContent.updatedAt));
}

export async function findAdminPageSection(
  page: string,
  section: string,
) {
  const [result] = await db
    .select()
    .from(pageContent)
    .where(
      and(
        eq(pageContent.page, page),
        eq(pageContent.section, section),
      ),
    )
    .limit(1);

  return result ?? null;
}

export async function upsertPageSection(
  page: string,
  section: string,
  input: PageContentInput,
  adminId: string,
  ipAddress: string | null,
  userAgent: string | null,
) {
  const existing = await findAdminPageSection(page, section);

  const values = {
    title: input.title ?? null,
    subtitle: input.subtitle ?? null,
    content: input.content ?? null,
    status: input.status ?? 'draft',
    isVisible: input.isVisible ?? true,
    displayOrder: input.displayOrder ?? 0,
    updatedAt: new Date(),
    updatedBy: adminId,
  };

  const [result] = await db
    .insert(pageContent)
    .values({
      page,
      section,
      ...values,
    })
    .onConflictDoUpdate({
      target: [pageContent.page, pageContent.section],
      set: values,
    })
    .returning();

  await logAdminAudit({
    adminId,
    action: existing
      ? 'page_content.updated'
      : 'page_content.created',
    entityType: 'page_content',
    entityId: result.id,
    description: `Page section "${page}/${section}" was ${existing ? 'updated' : 'created'}.`,
    oldValues: existing
      ? {
          status: existing.status,
          isVisible: existing.isVisible,
          displayOrder: existing.displayOrder,
        }
      : null,
    newValues: {
      page,
      section,
      status: result.status,
      isVisible: result.isVisible,
      displayOrder: result.displayOrder,
    },
    ipAddress,
    userAgent,
  });

  return result;
}

export async function deletePageSection(
  page: string,
  section: string,
  adminId: string,
  ipAddress: string | null,
  userAgent: string | null,
) {
  const existing = await findAdminPageSection(page, section);

  if (!existing) {
    return null;
  }

  await db
    .delete(pageContent)
    .where(
      and(
        eq(pageContent.page, page),
        eq(pageContent.section, section),
      ),
    );

  await logAdminAudit({
    adminId,
    action: 'page_content.deleted',
    entityType: 'page_content',
    entityId: existing.id,
    description: `Page section "${page}/${section}" was deleted.`,
    oldValues: {
      page,
      section,
      status: existing.status,
      isVisible: existing.isVisible,
    },
    ipAddress,
    userAgent,
  });

  return existing;
}
