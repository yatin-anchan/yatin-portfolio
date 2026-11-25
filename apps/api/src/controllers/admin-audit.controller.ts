
import type {
  Request,
  Response,
  NextFunction,
} from 'express';

import { getAdminAuditHistory } from '../services/admin-audit.service.js';

interface AuthenticatedAdmin {
  id: string;
}

interface AuditQuery {
  page: number;
  limit: number;
  action?: string;
  entityType?: string;
  fromDate?: string;
  toDate?: string;
}

export async function getAuditHistory(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = res.locals.admin as AuthenticatedAdmin;

    const query = res.locals.validated?.query as AuditQuery;

    const result = await getAdminAuditHistory(
      admin.id,
      {
        page: query.page,
        limit: query.limit,
        action: query.action,
        entityType: query.entityType,
        fromDate: query.fromDate
          ? new Date(query.fromDate)
          : undefined,
        toDate: query.toDate
          ? new Date(query.toDate)
          : undefined,
      },
    );

    res.status(200).json({
      success: true,
      data: result.records,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}
