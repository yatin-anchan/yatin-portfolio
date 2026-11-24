
import type { Request, Response } from 'express';
import {
  findPublishedProjects,
  findPublishedProjectBySlug,
} from '../services/projects.service.js';

interface ProjectsQuery {
  page: number;
  limit: number;
}

interface ProjectParams {
  slug: string;
}

export async function getProjects(
  _req: Request,
  res: Response,
): Promise<void> {
  const { page, limit } = res.locals.validated.query as ProjectsQuery;

  const result = await findPublishedProjects(page, limit);

  res.status(200).json({
    data: result.projects,
    meta: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
    },
  });
}

export async function getProjectBySlug(
  _req: Request,
  res: Response,
): Promise<void> {
  const { slug } = res.locals.validated.params as ProjectParams;

  const project = await findPublishedProjectBySlug(slug);

  if (!project) {
    res.status(404).json({
      error: {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found.',
      },
    });
    return;
  }

  res.status(200).json({
    data: project,
  });
}
