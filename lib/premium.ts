export const PREMIUM_YEAR_START = 2023;
export const PREMIUM_YEAR_END = 2026;

export function isPremiumYear(year: number | string | null | undefined) {
  if (year === null || year === undefined || year === '') {
    return false;
  }

  const parsedYear = Number(year);
  if (!Number.isFinite(parsedYear)) {
    return false;
  }

  return parsedYear >= PREMIUM_YEAR_START && parsedYear <= PREMIUM_YEAR_END;
}
