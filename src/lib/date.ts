export const todayKey=()=>{const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export const dayDiff=(a:string,b:string)=>{const parse=(s:string)=>{const [y,m,d]=s.split('-').map(Number);return Date.UTC(y,m-1,d)};return Math.round((parse(b)-parse(a))/86400000)};
export function addDays(date: string, amount: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(year, month - 1, day + amount);
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}
export const isYesterday = (lastDate: string, today: string) =>
  Boolean(lastDate) && addDays(lastDate, 1) === today;
export const isDue = (date: string, today: string) => date <= today;
export function calculateNextStreak(
  lastCompletedDate: string,
  today: string,
  currentStreak: number,
): number {
  if (!lastCompletedDate) return 1;
  if (lastCompletedDate === today) return currentStreak;
  return isYesterday(lastCompletedDate, today) ? currentStreak + 1 : 1;
}
export function calculateActiveStreakFromDates(
  dates: string[],
  referenceDate: string,
): number {
  const sorted = [...new Set(dates)].sort();
  if (!sorted.length) return 0;
  const latest = sorted.at(-1)!;
  if (!isYesterday(latest, referenceDate)) return 0;
  let streak = 1;
  for (let index = sorted.length - 1; index > 0; index -= 1) {
    if (!isYesterday(sorted[index - 1], sorted[index])) break;
    streak += 1;
  }
  return streak;
}
export const safeCourseIndex=(date:string)=>{const start='2026-01-01';return Math.abs(dayDiff(start,date))%30};
