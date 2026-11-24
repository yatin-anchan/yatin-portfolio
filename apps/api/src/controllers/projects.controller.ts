import type { Request, Response } from 'express';
import {
  findPublishedProjects,
  findPublishedProjectBySlug,
} from '../services/projects.service.js';

export async function getProjects(
  _req: Request,
  res: Response,
): Promise<void> {
  const projects = await findPublishedProjects();

  res.status(200).json({
    data: projects,
  });
}

export async function getProjectById(
  req: Request,
  res: Response,
): Promise<void> {
  const project = await findPublishedProjectBySlug(req.params.slug);

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