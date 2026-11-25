
import { createHash } from 'node:crypto';

import { env } from '../config/env.js';
import { ApiError } from '../lib/errors/api-error.js';
import { logAdminAudit } from './admin-audit.service.js';

export type MediaResourceType = 'image' | 'raw';

export type MediaCategory =
  | 'projects'
  | 'profile'
  | 'experience'
  | 'education'
  | 'certifications'
  | 'achievements'
  | 'resume';

interface AdminContext {
  adminId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

function getCloudinaryConfig() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = env;

  if (
    !CLOUDINARY_CLOUD_NAME ||
    !CLOUDINARY_API_KEY ||
    !CLOUDINARY_API_SECRET
  ) {
    throw new ApiError(
      503,
      'MEDIA_STORAGE_NOT_CONFIGURED',
      'Media storage is not configured.',
    );
  }

  return {
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    apiSecret: CLOUDINARY_API_SECRET,
  };
}

function createSignature(
  parameters: Record<string, string | number | boolean>,
  apiSecret: string,
): string {
  const canonical = Object.entries(parameters)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&');

  return createHash('sha1')
    .update(`${canonical}${apiSecret}`)
    .digest('hex');
}

function audit(
  admin: AdminContext,
  action: string,
  details: Record<string, unknown>,
) {
  return logAdminAudit({
    adminId: admin.adminId,
    action: `admin.media.${action}`,
    entityType: 'media',
    entityId: null,
    description: `Administrator ${action} a media asset.`,
    newValues: details,
    ipAddress: admin.ipAddress,
    userAgent: admin.userAgent,
  });
}

export async function createMediaUploadSignature(
  category: MediaCategory,
  resourceType: MediaResourceType,
  admin: AdminContext,
) {
  const config = getCloudinaryConfig();

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `portfolio/${category}`;

  const allowedFormats =
  resourceType === 'image'
    ? 'jpg,jpeg,png,webp,gif'
    : 'pdf';

const parameters = {
  allowed_formats: allowedFormats,
  folder,
  timestamp,
};

  const signature = createSignature(
    parameters,
    config.apiSecret,
  );

  await audit(admin, 'upload_signature_created', {
    category,
    resourceType,
    folder,
  });

  return {
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    timestamp,
    folder,
    signature,
    resourceType,
    uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/${resourceType}/upload`,
    allowedFormats,
  };
}

export async function deleteCloudinaryMedia(
  publicId: string,
  resourceType: MediaResourceType,
  admin: AdminContext,
) {
  const config = getCloudinaryConfig();

  if (!publicId.startsWith('portfolio/')) {
    throw new ApiError(
      400,
      'INVALID_MEDIA_PUBLIC_ID',
      'Only assets inside the portfolio folder can be deleted.',
    );
  }

  const timestamp = Math.floor(Date.now() / 1000);

  const parameters = {
    invalidate: true,
    public_id: publicId,
    timestamp,
  };

  const signature = createSignature(
    parameters,
    config.apiSecret,
  );

  const body = new FormData();

  body.set('public_id', publicId);
  body.set('timestamp', String(timestamp));
  body.set('api_key', config.apiKey);
  body.set('signature', signature);
  body.set('invalidate', 'true');

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${config.cloudName}/${resourceType}/destroy`,
    {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(30_000),
    },
  );

  const result = await response.json().catch(() => null) as {
    result?: string;
    error?: { message?: string };
  } | null;

  if (!response.ok || result?.result !== 'ok') {
    throw new ApiError(
      502,
      'MEDIA_DELETE_FAILED',
      result?.error?.message ?? 'Cloudinary could not delete the media asset.',
    );
  }

  await audit(admin, 'asset_deleted', {
    publicId,
    resourceType,
  });

  return {
    publicId,
    result: result.result,
  };
}
