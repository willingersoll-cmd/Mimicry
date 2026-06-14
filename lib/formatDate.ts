const ORDINALS: Record<number, string> = {
  1: 'st',
  2: 'nd',
  3: 'rd',
};

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  return ORDINALS[day % 10] ?? 'th';
}

/** e.g. "June 17th, 2025" */
export function formatPastTestDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const month = date.toLocaleString('en-US', { month: 'long' });
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month} ${day}${ordinalSuffix(day)}, ${year}`;
}
