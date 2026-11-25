
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';

import { requireAdmin } from '../middleware/admin-auth.js';
import { validate } from '../middleware/validate.js';

import {
  listResource,
  getResource,
  createResource,
  updateResource,
  deleteResource,
  getProfile,
  saveProfile,
  listSocialLinks,
  updateProjectImages,
} from '../controllers/admin-portfolio.controller.js';

const router = Router();

const managementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'PORTFOLIO_RATE_LIMITED',
      message: 'Too many portfolio management requests.',
    },
  },
});

const paramsSchema = z.object({
  id: z.string().uuid(),
}).strict();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

const optionalUrl = z.string().url().nullable().optional();

const projectContentBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('heading'),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    text: z.string().min(1).max(10000),
  }).strict(),
  z.object({
    type: z.literal('paragraph'),
    text: z.string().min(1).max(50000),
  }).strict(),
  z.object({
    type: z.literal('image'),
    url: z.string().url(),
    alt: z.string().min(1).max(300),
    caption: z.string().max(1000).optional(),
  }).strict(),
  z.object({
    type: z.literal('list'),
    items: z.array(z.string().min(1).max(5000)).max(100),
  }).strict(),
  z.object({
    type: z.literal('code'),
    language: z.string().min(1).max(50),
    code: z.string().max(50000),
  }).strict(),
]);

const projectContentSchema = z.object({
  version: z.literal(1),
  blocks: z.array(projectContentBlockSchema).max(200),
}).strict();

const projectSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(220)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  shortDescription: z.string().trim().min(1).max(10000),
  content: projectContentSchema,
  techStack: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  thumbnailUrl: optionalUrl,
  repositoryUrl: optionalUrl,
  liveUrl: optionalUrl,
  isFeatured: z.boolean().default(false),
  isPublished: z.boolean().default(false),
  displayOrder: z.number().int().min(0).default(0),
}).strict();

const skillSchema = z.object({
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: z.string().trim().min(1).max(100),
  description: z.string().max(10000).nullable().optional(),
  proficiency: z.number().int().min(0).max(100).nullable().optional(),
  iconUrl: optionalUrl,
  isFeatured: z.boolean().default(false),
  isPublished: z.boolean().default(false),
  displayOrder: z.number().int().min(0).default(0),
}).strict();

const experienceSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(200),
  employmentType: z.string().trim().min(1).max(50),
  location: z.string().max(200).nullable().optional(),
  workplaceType: z.string().max(30).nullable().optional(),
  description: z.string().max(50000).nullable().optional(),
  responsibilities: z.array(z.string().max(5000)).max(100).default([]),
  companyUrl: optionalUrl,
  companylogoUrl: optionalUrl,
  startDate: z.string().date(),
  endDate: z.string().date().nullable().optional(),
  isCurrent: z.boolean().default(false),
  isPublished: z.boolean().default(false),
  displayOrder: z.number().int().min(0).default(0),
}).strict().refine(
  (data) => !data.isCurrent || !data.endDate,
  { message: 'Current experience cannot have an end date.', path: ['endDate'] },
).refine(
  (data) => !data.endDate || data.endDate >= data.startDate,
  { message: 'End date cannot be earlier than start date.', path: ['endDate'] },
);

const educationSchema = z.object({
  institutionName: z.string().trim().min(1).max(200),
  qualification: z.string().trim().min(1).max(200),
  fieldOfStudy: z.string().max(200).nullable().optional(),
  educationLevel: z.string().trim().min(1).max(50),
  location: z.string().max(200).nullable().optional(),
  institutionUrl: optionalUrl,
  institutionLogoUrl: optionalUrl,
  description: z.string().max(50000).nullable().optional(),
  achievements: z.array(z.string().max(5000)).max(100).default([]),
  gradeType: z.enum([
    'grade', 'cgpa', 'percentage', 'percentile', 'gpa', 'other',
  ]).nullable().optional(),
  gradeValue: z.string().max(50).nullable().optional(),
  gradeScale: z.string().max(30).nullable().optional(),
  startDate: z.string().date(),
  endDate: z.string().date().nullable().optional(),
  isCurrent: z.boolean().default(false),
  isPublished: z.boolean().default(false),
  displayOrder: z.number().int().min(0).default(0),
}).strict().refine(
  (data) => !data.isCurrent || !data.endDate,
  { message: 'Current education cannot have an end date.', path: ['endDate'] },
).refine(
  (data) => !data.endDate || data.endDate >= data.startDate,
  { message: 'End date cannot be earlier than start date.', path: ['endDate'] },
);

const certificationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  issuingOrganization: z.string().trim().min(1).max(200),
  credentialId: z.string().max(200).nullable().optional(),
  credentialUrl: optionalUrl,
  organizationLogoUrl: optionalUrl,
  certificateImageUrl: optionalUrl,
  description: z.string().max(50000).nullable().optional(),
  skills: z.array(z.string().max(100)).max(100).default([]),
  issueDate: z.string().date(),
  expiryDate: z.string().date().nullable().optional(),
  doesNotExpire: z.boolean().default(true),
  isPublished: z.boolean().default(false),
  displayOrder: z.number().int().min(0).default(0),
}).strict().refine(
  (data) => !data.doesNotExpire || !data.expiryDate,
  { message: 'A non-expiring certification cannot have an expiry date.', path: ['expiryDate'] },
).refine(
  (data) => !data.expiryDate || data.expiryDate >= data.issueDate,
  { message: 'Expiry date cannot be earlier than issue date.', path: ['expiryDate'] },
);

const achievementContentBlockSchema = z.object({
  type: z.enum(['heading', 'paragraph', 'image', 'list', 'code']),
}).passthrough();

const achievementSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(50),
  issuer: z.string().max(200).nullable().optional(),
  shortDescription: z.string().trim().min(1).max(10000),
  content: z.object({
    version: z.literal(1),
    blocks: z.array(achievementContentBlockSchema).max(200),
  }).strict(),
  achievedDate: z.string().date().nullable().optional(),
  eventName: z.string().max(200).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  media: z.array(z.object({
    url: z.string().url(),
    type: z.enum(['image', 'document']),
    alt: z.string().max(300),
  }).strict()).max(100).default([]),
  credentialUrl: optionalUrl,
  isFeatured: z.boolean().default(false),
  isPublished: z.boolean().default(false),
  displayOrder: z.number().int().min(0).default(0),
}).strict();

const profileSchema = z.object({
  fullName: z.string().trim().min(1).max(150),
  professionalTitle: z.string().trim().min(1).max(200),
  tagline: z.string().max(250).nullable().optional(),
  profileImageUrl: optionalUrl,
  coverImageUrl: optionalUrl,
  shortBio: z.string().max(50000).nullable().optional(),
  aboutContent: z.object({
    version: z.literal(1),
    blocks: z.array(achievementContentBlockSchema).max(200),
  }).strict().nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  isEmailVisible: z.boolean().default(true),
  phone: z.string().max(30).nullable().optional(),
  isPhoneVisible: z.boolean().default(false),
  location: z.string().max(200).nullable().optional(),
  resumeUrl: optionalUrl,
  availabilityStatus: z.enum(['available', 'employed', 'unavailable']).default('available'),
  yearsOfExperience: z.number().min(0).max(999.9).nullable().optional(),
  seoTitle: z.string().max(200).nullable().optional(),
  seoDescription: z.string().max(10000).nullable().optional(),
}).strict();

const socialLinkSchema = z.object({
  platform: z.string().trim().min(1).max(50),
  label: z.string().trim().min(1).max(100),
  url: z.string().url(),
  category: z.enum(['social', 'professional', 'website', 'other']).default('social'),
  isVisible: z.boolean().default(true),
  displayOrder: z.number().int().min(0).default(0),
}).strict();

const projectImagesSchema = z.object({
  images: z.array(z.object({
    imageUrl: z.string().url(),
    altText: z.string().trim().min(1).max(300),
    caption: z.string().max(10000).nullable().optional(),
    displayOrder: z.number().int().min(0).default(0),
  }).strict()).max(100),
}).strict();

function partialSchema<T extends z.ZodObject<any>>(schema: T) {
  return schema.partial();
}

router.use(requireAdmin);
router.use(managementLimiter);

function registerCollection(
  path: string,
  resource:
    | 'projects'
    | 'skills'
    | 'experience'
    | 'education'
    | 'certifications'
    | 'achievements'
    | 'socialLinks',
  schema: z.ZodObject<any>,
) {
  const partial = partialSchema(schema);

  router.get(
    `/${path}`,
    validate(paginationSchema, 'query'),
    listResource(resource),
  );

  router.get(
    `/${path}/:id`,
    validate(paramsSchema, 'params'),
    getResource(resource),
  );

  router.post(
    `/${path}`,
    validate(schema, 'body'),
    createResource(resource),
  );

  router.patch(
    `/${path}/:id`,
    validate(paramsSchema, 'params'),
    validate(partial, 'body'),
    updateResource(resource),
  );

  router.delete(
    `/${path}/:id`,
    validate(paramsSchema, 'params'),
    deleteResource(resource),
  );
}

registerCollection('projects', 'projects', projectSchema);
registerCollection('skills', 'skills', skillSchema);
registerCollection('experience', 'experience', experienceSchema);
registerCollection('education', 'education', educationSchema);
registerCollection('certifications', 'certifications', certificationSchema);
registerCollection('achievements', 'achievements', achievementSchema);
registerCollection('social-links', 'socialLinks', socialLinkSchema);

router.put(
  '/projects/:id/images',
  validate(paramsSchema, 'params'),
  validate(projectImagesSchema, 'body'),
  updateProjectImages,
);

router.get('/profile', getProfile);

router.put(
  '/profile',
  validate(profileSchema, 'body'),
  saveProfile,
);

export default router;
