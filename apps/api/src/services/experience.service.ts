
import { asc, desc, eq } from 'drizzle-orm';
import { db, experience } from '@yatin-portfolio/database';

export async function findPublishedExperience() {
  return db
    .select({
      id: experience.id,
      companyName: experience.companyName,
      role: experience.role,
      employmentType: experience.employmentType,
      location: experience.location,
      workplaceType: experience.workplaceType,
      description: experience.description,
      responsibilities: experience.responsibilities,
      companyUrl: experience.companyUrl,
      companylogoUrl: experience.companylogoUrl,
      startDate: experience.startDate,
      endDate: experience.endDate,
      isCurrent: experience.isCurrent,
      displayOrder: experience.displayOrder,
    })
    .from(experience)
    .where(eq(experience.isPublished, true))
    .orderBy(
      asc(experience.displayOrder),
      desc(experience.startDate),
    );
}
