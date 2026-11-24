import { and, asc, eq } from 'drizzle-orm';

import { db, socialLinks } from '@yatin-portfolio/database';

export interface SocialLinksFilters {
  category?: 'social' | 'professional' | 'website' | 'other';
}

export async function findVisibleSocialLinks(
  filters: SocialLinksFilters,
) {
  const conditions = [eq(socialLinks.isVisible, true)];

  if (filters.category) {
    conditions.push(eq(socialLinks.category, filters.category));
  }

  return db
    .select({
      id: socialLinks.id,
      platform: socialLinks.platform,
      label: socialLinks.label,
      url: socialLinks.url,
      category: socialLinks.category,
      displayOrder: socialLinks.displayOrder,
    })
    .from(socialLinks)
    .where(and(...conditions))
    .orderBy(
      asc(socialLinks.displayOrder),
      asc(socialLinks.platform),
    );
}