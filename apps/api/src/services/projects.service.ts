
import {
  and,
  asc,
  count,
  desc,
  eq,
} from 'drizzle-orm';

import {
  db,
  projects,
  projectImages,
} from '@yatin-portfolio/database';

export async function findPublishedProjects(
  page: number,
  limit: number,
) {
  const offset = (page - 1) * limit;

  const conditions = eq(projects.isPublished, true);

  const [projectList, totalResult] = await Promise.all([
    db
      .select({
        id: projects.id,
        title: projects.title,
        slug: projects.slug,
        shortDescription: projects.shortDescription,
        techStack: projects.techStack,
        thumbnailUrl: projects.thumbnailUrl,
        repositoryUrl: projects.repositoryUrl,
        liveUrl: projects.liveUrl,
        isFeatured: projects.isFeatured,
        displayOrder: projects.displayOrder,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .where(conditions)
      .orderBy(
        asc(projects.displayOrder),
        desc(projects.createdAt),
      )
      .limit(limit)
      .offset(offset),

    db
      .select({
        total: count(),
      })
      .from(projects)
      .where(conditions),
  ]);

  return {
    projects: projectList,
    total: totalResult[0]?.total ?? 0,
  };
}

export async function findPublishedProjectBySlug(
  slug: string,
) {
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.slug, slug),
        eq(projects.isPublished, true),
      ),
    )
    .limit(1);

  if (!project) {
    return null;
  }

  const images = await db
    .select()
    .from(projectImages)
    .where(eq(projectImages.projectId, project.id))
    .orderBy(asc(projectImages.displayOrder));

  return {
    ...project,
    images,
  };
}
