import { db, profiles } from '@yatin-portfolio/database';
import { normalizeProfileExperience } from '../lib/profile-values.js';

export async function findProfile() {
  const [profile] = await db
    .select()
    .from(profiles)
    .limit(1);

  return profile ? normalizeProfileExperience(profile) : null;
}