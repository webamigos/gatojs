import { formatInTimeZone } from "date-fns-tz";
import { pl } from "date-fns/locale";

export const APP_TIMEZONE = "Europe/Warsaw";

export function utcMonthStart(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1));
}

export function utcNextMonthStart(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex + 1, 1));
}

export function utcDayStart(
  year: number,
  monthIndex: number,
  day: number,
): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

export function utcNextDayStart(
  year: number,
  monthIndex: number,
  day: number,
): Date {
  return new Date(Date.UTC(year, monthIndex, day + 1));
}

export function formatInAppTz(date: Date | string, pattern: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) {
    throw new Error(`formatInAppTz: invalid date input "${String(date)}"`);
  }
  return formatInTimeZone(d, APP_TIMEZONE, pattern, { locale: pl });
}

export function nowInAppTz(): { year: number; month: number; day: number } {
  const parts = formatInTimeZone(new Date(), APP_TIMEZONE, "yyyy-MM-dd").split(
    "-",
  );
  return {
    year: Number(parts[0]),
    month: Number(parts[1]),
    day: Number(parts[2]),
  };
}
