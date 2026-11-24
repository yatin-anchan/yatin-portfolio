import { db, profiles } from '@yatin-portfolio/database';

export async function findProfile() {
  const [profile] = await db
    .select()
    .from(profiles)
    .limit(1);

  return profile ?? null;
}