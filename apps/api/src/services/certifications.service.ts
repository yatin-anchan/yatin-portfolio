
import { asc, desc, eq } from 'drizzle-orm';
import {
  db,
  certifications,
} from '@yatin-portfolio/database';

export async function findPublishedCertifications() {
  return db
    .select({
      id: certifications.id,
      title: certifications.title,
      issuingOrganization: certifications.issuingOrganization,
      credentialId: certifications.credentialId,
      credentialUrl: certifications.credentialUrl,
      organizationLogoUrl: certifications.organizationLogoUrl,
      certificateImageUrl: certifications.certificateImageUrl,
      description: certifications.description,
      skills: certifications.skills,
      issueDate: certifications.issueDate,
      expiryDate: certifications.expiryDate,
      doesNotExpire: certifications.doesNotExpire,
      displayOrder: certifications.displayOrder,
    })
    .from(certifications)
    .where(eq(certifications.isPublished, true))
    .orderBy(
      asc(certifications.displayOrder),
      desc(certifications.issueDate),
    );
}
