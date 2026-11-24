
import { asc, desc, eq } from 'drizzle-orm';
import { db, education } from '@yatin-portfolio/database';

export async function findPublishedEducation() {
  return db
    .select({
      id: education.id,
      institutionName: education.institutionName,
      qualification: education.qualification,
      fieldOfStudy: education.fieldOfStudy,
      educationLevel: education.educationLevel,
      location: education.location,
      institutionUrl: education.institutionUrl,
      institutionLogoUrl: education.institutionLogoUrl,
      description: education.description,
      achievements: education.achievements,
      gradeType: education.gradeType,
      gradeValue: education.gradeValue,
      gradeScale: education.gradeScale,
      startDate: education.startDate,
      endDate: education.endDate,
      isCurrent: education.isCurrent,
      displayOrder: education.displayOrder,
    })
    .from(education)
    .where(eq(education.isPublished, true))
    .orderBy(
      asc(education.displayOrder),
      desc(education.startDate),
    );
}
