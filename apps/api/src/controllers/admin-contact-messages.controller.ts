
import type {
  Request,
  Response,
  NextFunction,
} from 'express';

import {
  listContactMessages,
  getContactMessage,
  updateContactMessageStatus,
  updateContactMessageNotes,
  replyToContactMessage,
  deleteContactMessage,
  type ContactMessageStatus,
} from '../services/admin-contact-messages.service.js';

interface AuthenticatedAdmin {
  id: string;
}

interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

function getAdmin(res: Response): AuthenticatedAdmin {
  return res.locals.admin as AuthenticatedAdmin;
}

function getMetadata(req: Request): RequestMetadata {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}

export async function listMessages(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = getAdmin(res);

    const query = res.locals.validated?.query as {
      page: number;
      limit: number;
      status?: ContactMessageStatus;
      search?: string;
      fromDate?: string;
      toDate?: string;
    };

    const result = await listContactMessages(admin.id, {
      page: query.page,
      limit: query.limit,
      status: query.status,
      search: query.search,
      fromDate: query.fromDate
        ? new Date(query.fromDate)
        : undefined,
      toDate: query.toDate
        ? new Date(query.toDate)
        : undefined,
    });

    res.status(200).json({
      success: true,
      data: result.messages,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

export async function getMessage(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = res.locals.validated?.params as {
      id: string;
    };

    const message = await getContactMessage(id);

    res.status(200).json({
      success: true,
      data: message,
    });
  } catch (error) {
    next(error);
  }
}

export async function changeMessageStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = getAdmin(res);

    const { id } = res.locals.validated?.params as {
      id: string;
    };

    const { status } = res.locals.validated?.body as {
      status: ContactMessageStatus;
    };

    const message = await updateContactMessageStatus(
      admin.id,
      id,
      status,
      getMetadata(req),
    );

    res.status(200).json({
      success: true,
      message: 'Contact message status updated.',
      data: message,
    });
  } catch (error) {
    next(error);
  }
}

export async function saveMessageNotes(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = getAdmin(res);

    const { id } = res.locals.validated?.params as {
      id: string;
    };

    const { notes } = res.locals.validated?.body as {
      notes: string;
    };

    const message = await updateContactMessageNotes(
      admin.id,
      id,
      notes,
      getMetadata(req),
    );

    res.status(200).json({
      success: true,
      message: 'Internal notes updated.',
      data: message,
    });
  } catch (error) {
    next(error);
  }
}

export async function replyToMessage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = getAdmin(res);

    const { id } = res.locals.validated?.params as {
      id: string;
    };

    const { reply } = res.locals.validated?.body as {
      reply: string;
    };

    const message = await replyToContactMessage(
      admin.id,
      id,
      reply,
      getMetadata(req),
    );

    res.status(200).json({
      success: true,
      message: 'Reply sent successfully.',
      data: message,
    });
  } catch (error) {
    next(error);
  }
}

export async function removeMessage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = getAdmin(res);

    const { id } = res.locals.validated?.params as {
      id: string;
    };

    await deleteContactMessage(
      admin.id,
      id,
      getMetadata(req),
    );

    res.status(200).json({
      success: true,
      message: 'Contact message deleted permanently.',
    });
  } catch (error) {
    next(error);
  }
}
