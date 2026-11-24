import { and, asc, eq } from 'drizzle-orm';

import {
  db,
  skills,
} from '@yatin-portfolio/database';

export interface SkillsFilters {
  category?: string;
  featured?: boolean;
}

export async function findPublishedSkills(
  filters: SkillsFilters,
) {
  const conditions = [
    eq(skills.isPublished, true),
  ];

  if (filters.category) {
    conditions.push(
      eq(skills.category, filters.category),
    );
  }

  if (filters.featured !== undefined) {
    conditions.push(
      eq(skills.isFeatured, filters.featured),
    );
  }

  return db
    .select({
      id: skills.id,
      parentId: skills.parentId,
      name: skills.name,
      slug: skills.slug,
      category: skills.category,
      description: skills.description,
      proficiency: skills.proficiency,
      iconUrl: skills.iconUrl,
      isFeatured: skills.isFeatured,
      displayOrder: skills.displayOrder,
    })
    .from(skills)
    .where(and(...conditions))
    .orderBy(
      asc(skills.displayOrder),
      asc(skills.name),
    );
}