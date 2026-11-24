import { desc, eq, and, asc } from 'drizzle-orm';
import { db, projects, projectImages } from '@yatin-portfolio/database';

export async function findPublishedProjects() {
  return db
    .select()
    .from(projects)
    .where(eq(projects.isPublished, true))
    .orderBy(asc(projects.displayOrder), desc(projects.createdAt));
}

export async function findPublishedProjectBySlug(slug: string) {
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

  if (!project) return null;

  const images = await db
    .select()
    .from(projectImages)
    .where(eq(projectImages.projectId, project.id))
    .orderBy(asc(projectImages.displayOrder));

  return { ...project, images };
}