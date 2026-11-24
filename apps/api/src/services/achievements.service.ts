
import { and, asc, desc, eq } from 'drizzle-orm';
import {
  db,
  achievements,
} from '@yatin-portfolio/database';

interface AchievementFilters {
  category?: string;
  featured?: boolean;
}

export async function findPublishedAchievements(
  filters: AchievementFilters = {},
) {
  const conditions = [
    eq(achievements.isPublished, true),
    ...(filters.category
      ? [eq(achievements.category, filters.category)]
      : []),
    ...(filters.featured !== undefined
      ? [eq(achievements.isFeatured, filters.featured)]
      : []),
  ];

  return db
    .select({
      id: achievements.id,
      title: achievements.title,
      category: achievements.category,
      issuer: achievements.issuer,
      shortDescription: achievements.shortDescription,
      achievedDate: achievements.achievedDate,
      eventName: achievements.eventName,
      location: achievements.location,
      media: achievements.media,
      credentialUrl: achievements.credentialUrl,
      isFeatured: achievements.isFeatured,
      displayOrder: achievements.displayOrder,
    })
    .from(achievements)
    .where(and(...conditions))
    .orderBy(
      asc(achievements.displayOrder),
      desc(achievements.achievedDate),
    );
}

export async function findPublishedAchievementById(id: string) {
  const [achievement] = await db
    .select()
    .from(achievements)
    .where(
      and(
        eq(achievements.id, id),
        eq(achievements.isPublished, true),
      ),
    )
    .limit(1);

  return achievement ?? null;
}
