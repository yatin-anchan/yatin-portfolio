import { ApiError } from './errors/api-error.js';

type ProfileExperienceValue = string | number | null;

export function normalizeProfileExperience<
  T extends { yearsOfExperience: ProfileExperienceValue },
>(
  profile: T,
): Omit<T, 'yearsOfExperience'> & { yearsOfExperience: number | null } {
  const value = profile.yearsOfExperience;

  if (value === null) {
    return { ...profile, yearsOfExperience: null };
  }

  const yearsOfExperience = Number(value);

  if (!Number.isFinite(yearsOfExperience)) {
    throw new ApiError(
      500,
      'INVALID_STORED_PROFILE_VALUE',
      'The stored profile experience value is invalid.',
    );
  }

  return {
    ...profile,
    yearsOfExperience: Math.round(yearsOfExperience * 10) / 10,
  };
}
