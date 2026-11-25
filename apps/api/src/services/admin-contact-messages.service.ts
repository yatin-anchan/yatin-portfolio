
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  type SQL,
} from 'drizzle-orm';

import {
  db,
  contactMessages,
} from '@yatin-portfolio/database';

import { sendEmail } from './email.service.js';
import { logAdminAudit } from './admin-audit.service.js';
import { ApiError } from '../lib/errors/api-error.js';

export const CONTACT_MESSAGE_STATUSES = [
  'unread',
  'read',
  'replied',
  'archived',
  'spam',
] as const;

export type ContactMessageStatus =
  (typeof CONTACT_MESSAGE_STATUSES)[number];

interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

interface ListMessagesInput {
  page: number;
  limit: number;
  status?: ContactMessageStatus;
  search?: string;
  fromDate?: Date;
  toDate?: Date;
}

function auditMetadata(metadata: RequestMetadata) {
  return {
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
  };
}

/**
 * List contact messages with filtering and pagination.
 */
export async function listContactMessages(
  adminId: string,
  filters: ListMessagesInput,
) {
  const conditions: SQL[] = [];

  if (filters.status) {
    conditions.push(
      eq(contactMessages.status, filters.status),
    );
  }

  if (filters.search) {
    const search = `%${filters.search}%`;

    const searchCondition = or(
      ilike(contactMessages.name, search),
      ilike(contactMessages.email, search),
      ilike(contactMessages.subject, search),
      ilike(contactMessages.message, search),
    );

    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  if (filters.fromDate) {
    conditions.push(
      gte(contactMessages.createdAt, filters.fromDate),
    );
  }

  if (filters.toDate) {
    conditions.push(
      lte(contactMessages.createdAt, filters.toDate),
    );
  }

  const whereClause = conditions.length
    ? and(...conditions)
    : undefined;

  const offset = (filters.page - 1) * filters.limit;

  const [messages, [totalRecord]] = await Promise.all([
    db
      .select()
      .from(contactMessages)
      .where(whereClause)
      .orderBy(desc(contactMessages.createdAt))
      .limit(filters.limit)
      .offset(offset),

    db
      .select({ total: count() })
      .from(contactMessages)
      .where(whereClause),
  ]);

  const total = Number(totalRecord?.total ?? 0);

  return {
    messages,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
      hasNextPage: offset + messages.length < total,
      hasPreviousPage: filters.page > 1,
    },
  };
}

/**
 * Retrieve one complete contact message.
 */
export async function getContactMessage(
  id: string,
) {
  const [message] = await db
    .select()
    .from(contactMessages)
    .where(eq(contactMessages.id, id))
    .limit(1);

  if (!message) {
    throw new ApiError(
      404,
      'CONTACT_MESSAGE_NOT_FOUND',
      'Contact message not found.',
    );
  }

  return message;
}

/**
 * Update a contact message's status.
 */
export async function updateContactMessageStatus(
  adminId: string,
  id: string,
  status: ContactMessageStatus,
  metadata: RequestMetadata,
) {
  const [existing] = await db
    .select({
      id: contactMessages.id,
      status: contactMessages.status,
    })
    .from(contactMessages)
    .where(eq(contactMessages.id, id))
    .limit(1);

  if (!existing) {
    throw new ApiError(
      404,
      'CONTACT_MESSAGE_NOT_FOUND',
      'Contact message not found.',
    );
  }

  const [updated] = await db
    .update(contactMessages)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(contactMessages.id, id))
    .returning();

  if (!updated) {
    throw new ApiError(
      500,
      'CONTACT_MESSAGE_UPDATE_FAILED',
      'Unable to update contact message.',
    );
  }

  await logAdminAudit({
    adminId,
    action: 'admin.contact_message_status_updated',
    entityType: 'contact_message',
    entityId: id,
    description: 'Administrator updated a contact message status.',
    oldValues: { status: existing.status },
    newValues: { status },
    ...auditMetadata(metadata),
  });

  return updated;
}

/**
 * Add or replace internal administrator notes.
 * An empty string clears existing notes.
 */
export async function updateContactMessageNotes(
  adminId: string,
  id: string,
  notes: string,
  metadata: RequestMetadata,
) {
  const [existing] = await db
    .select({
      id: contactMessages.id,
      adminNotes: contactMessages.adminNotes,
    })
    .from(contactMessages)
    .where(eq(contactMessages.id, id))
    .limit(1);

  if (!existing) {
    throw new ApiError(
      404,
      'CONTACT_MESSAGE_NOT_FOUND',
      'Contact message not found.',
    );
  }

  const [updated] = await db
    .update(contactMessages)
    .set({
      adminNotes: notes || null,
      updatedAt: new Date(),
    })
    .where(eq(contactMessages.id, id))
    .returning();

  if (!updated) {
    throw new ApiError(
      500,
      'CONTACT_MESSAGE_UPDATE_FAILED',
      'Unable to update contact message notes.',
    );
  }

  await logAdminAudit({
    adminId,
    action: 'admin.contact_message_notes_updated',
    entityType: 'contact_message',
    entityId: id,
    description: 'Administrator updated internal contact message notes.',
    ...auditMetadata(metadata),
  });

  return updated;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };

    return entities[character] ?? character;
  });
}

/**
 * Send an email reply and then mark the message as replied.
 */
export async function replyToContactMessage(
  adminId: string,
  id: string,
  reply: string,
  metadata: RequestMetadata,
) {
  const message = await getContactMessage(id);

  const subject = /^re:/i.test(message.subject)
    ? message.subject
    : `Re: ${message.subject}`;

  const safeReply = escapeHtml(reply).replace(/\n/g, '<br>');

  // If SMTP fails, no status change is made.
  await sendEmail({
    to: message.email,
    subject,
    text: reply,
    html: `<div>${safeReply}</div>`,
  });

  const now = new Date();

  const [updated] = await db
    .update(contactMessages)
    .set({
      status: 'replied',
      repliedAt: now,
      updatedAt: now,
    })
    .where(eq(contactMessages.id, id))
    .returning();

  if (!updated) {
    throw new ApiError(
      500,
      'CONTACT_MESSAGE_REPLY_UPDATE_FAILED',
      'The email was sent, but the message status could not be updated. Check the message before retrying.',
    );
  }

  await logAdminAudit({
    adminId,
    action: 'admin.contact_message_replied',
    entityType: 'contact_message',
    entityId: id,
    description: 'Administrator sent an email reply to a contact message.',
    ...auditMetadata(metadata),
  });

  return updated;
}

/**
 * Permanently delete a contact message.
 */
export async function deleteContactMessage(
  adminId: string,
  id: string,
  metadata: RequestMetadata,
): Promise<void> {
  const [deleted] = await db
    .delete(contactMessages)
    .where(eq(contactMessages.id, id))
    .returning({
      id: contactMessages.id,
    });

  if (!deleted) {
    throw new ApiError(
      404,
      'CONTACT_MESSAGE_NOT_FOUND',
      'Contact message not found.',
    );
  }

  await logAdminAudit({
    adminId,
    action: 'admin.contact_message_deleted',
    entityType: 'contact_message',
    entityId: id,
    description: 'Administrator permanently deleted a contact message.',
    ...auditMetadata(metadata),
  });
}
