
import {
  and,
  count,
  desc,
  eq,
  gte,
  lte,
} from 'drizzle-orm';

import {
  db,
  adminAuditLogs,
} from '@yatin-portfolio/database';

export interface AdminAuditInput {
  adminId: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  description?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditHistoryFilters {
  action?: string;
  entityType?: string;
  fromDate?: Date;
  toDate?: Date;
  page: number;
  limit: number;
}

const SENSITIVE_KEY =
  /password|token|secret|otp|code|cookie|authorization|credential|backup.?email|email/i;

function sanitizeAuditValue(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > 5) {
    return '[MAX_DEPTH_REACHED]';
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) =>
      sanitizeAuditValue(item, depth + 1),
    );
  }

  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      sanitized[key] = SENSITIVE_KEY.test(key)
        ? '[REDACTED]'
        : sanitizeAuditValue(item, depth + 1);
    }

    return sanitized;
  }

  if (typeof value === 'string') {
    return value.length > 1000
      ? `${value.slice(0, 1000)}...[TRUNCATED]`
      : value;
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  return '[UNSUPPORTED_VALUE]';
}

/**
 * Central audit logging function.
 * Sensitive fields are redacted before database insertion.
 */
type AuditTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export async function logAdminAudit(
  input: AdminAuditInput,
  tx?: AuditTransaction,
): Promise<void> {
  const values = {
    adminId: input.adminId,
    action: input.action,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    description: input.description ?? null,
    oldValues: input.oldValues
      ? sanitizeAuditValue(input.oldValues)
      : null,
    newValues: input.newValues
      ? sanitizeAuditValue(input.newValues)
      : null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  };

  if (tx) {
    await tx.insert(adminAuditLogs).values(values);
    return;
  }

  await db.insert(adminAuditLogs).values(values);
}



/**
 * Retrieve paginated audit history for one administrator.
 */
export async function getAdminAuditHistory(
  adminId: string,
  filters: AuditHistoryFilters,
) {
  const conditions = [
    eq(adminAuditLogs.adminId, adminId),
  ];

  if (filters.action) {
    conditions.push(eq(adminAuditLogs.action, filters.action));
  }

  if (filters.entityType) {
    conditions.push(
      eq(adminAuditLogs.entityType, filters.entityType),
    );
  }

  if (filters.fromDate) {
    conditions.push(
      gte(adminAuditLogs.createdAt, filters.fromDate),
    );
  }

  if (filters.toDate) {
    conditions.push(
      lte(adminAuditLogs.createdAt, filters.toDate),
    );
  }

  const whereClause = and(...conditions);

  const offset = (filters.page - 1) * filters.limit;

  const [records, [totalRecord]] = await Promise.all([
    db
      .select({
        id: adminAuditLogs.id,
        action: adminAuditLogs.action,
        entityType: adminAuditLogs.entityType,
        entityId: adminAuditLogs.entityId,
        description: adminAuditLogs.description,
        oldValues: adminAuditLogs.oldValues,
        newValues: adminAuditLogs.newValues,
        ipAddress: adminAuditLogs.ipAddress,
        userAgent: adminAuditLogs.userAgent,
        createdAt: adminAuditLogs.createdAt,
      })
      .from(adminAuditLogs)
      .where(whereClause)
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(filters.limit)
      .offset(offset),

    db
      .select({
        total: count(),
      })
      .from(adminAuditLogs)
      .where(whereClause),
  ]);

  const total = Number(totalRecord?.total ?? 0);

  return {
    records,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
      hasNextPage: offset + records.length < total,
      hasPreviousPage: filters.page > 1,
    },
  };
}
