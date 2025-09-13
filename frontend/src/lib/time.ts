/**
 * Time utilities using Luxon for timezone handling
 */

import { DateTime } from 'luxon';
import { WeekInfo, DayInfo, TimeSlot } from '../types';

/**
 * Get the start of the week (Monday) for a given date in a specific timezone
 */
export function getWeekStart(date: DateTime): DateTime {
  return date.startOf('week');
}

/**
 * Get the end of the week (Sunday) for a given date in a specific timezone
 */
export function getWeekEnd(date: DateTime): DateTime {
  return date.endOf('week');
}

/**
 * Get week information for the calendar display
 */
export function getWeekInfo(weekStartISO: string, timezone: string): WeekInfo {
  // Parse the week start date and convert it to the target timezone
  // The weekStartISO might be in a different timezone, so we need to parse it first
  const weekStart = DateTime.fromISO(weekStartISO).setZone(timezone);
  
  // Calculate week end by adding 6 days and 23:59:59.999 to get the full week
  const weekEnd = weekStart.plus({ days: 6 }).endOf('day');
  
  const days: DayInfo[] = [];
  const today = DateTime.now().setZone(timezone);
  
  for (let i = 0; i < 7; i++) {
    const day = weekStart.plus({ days: i });
    days.push({
      date: day.toISODate() || '',
      dayName: day.toFormat('ccc'), // Mon, Tue, etc.
      dayNumber: day.day,
      isToday: day.hasSame(today, 'day')
    });
  }
  
  return {
    weekStart: weekStart.toISO() || '',
    weekEnd: weekEnd.toISO() || '',
    days
  };
}

/**
 * Get the current week start in a specific timezone
 */
export function getCurrentWeekStart(timezone: string): string {
  const now = DateTime.now().setZone(timezone);
  const weekStart = getWeekStart(now);
  return weekStart.toISO() || '';
}

/**
 * Navigate to previous/next week
 */
export function navigateWeek(currentWeekStartISO: string, direction: 'prev' | 'next', timezone: string): string {
  const current = DateTime.fromISO(currentWeekStartISO, { zone: timezone });
  const delta = direction === 'next' ? 7 : -7;
  const newWeekStart = current.plus({ days: delta });
  return newWeekStart.toISO() || '';
}

/**
 * Convert UTC ISO string to local time in specified timezone
 */
export function utcToLocal(utcISOString: string, timezone: string): DateTime {
  return DateTime.fromISO(utcISOString, { zone: 'utc' }).setZone(timezone);
}

/**
 * Convert local time to UTC ISO string
 */
export function localToUTC(localDateTime: DateTime): string {
  return localDateTime.toUTC().toISO() || '';
}

/**
 * Format time for display (e.g., "9:00 AM")
 */
export function formatTime(dateTime: DateTime): string {
  return dateTime.toFormat('h:mm a');
}

/**
 * Format date for display (e.g., "Jan 20, 2025")
 */
export function formatDate(dateTime: DateTime): string {
  return dateTime.toFormat('MMM d, yyyy');
}

/**
 * Format date and time for display (e.g., "Jan 20, 2025 at 9:00 AM")
 */
export function formatDateTime(dateTime: DateTime): string {
  return dateTime.toFormat('MMM d, yyyy \'at\' h:mm a');
}

/**
 * Get time slots for the calendar grid (24 hours: 00:00 to 23:30)
 */
export function getTimeSlots(): TimeSlot[] {
  const slots: TimeSlot[] = [];
  
  for (let hour = 0; hour <= 23; hour++) {
    // Hour marker (e.g., 9:00, 14:00, 23:00)
    const hourLabel = hour.toString().padStart(2, '0') + ':00';
    slots.push({
      hour: hour,
      minute: 0,
      label: hourLabel,
      isHour: true
    });
    
    // Half-hour marker (e.g., 9:30, 14:30) - only if not the last hour
    if (hour < 23) {
      const halfHourLabel = hour.toString().padStart(2, '0') + ':30';
      slots.push({
        hour: hour,
        minute: 30,
        label: halfHourLabel,
        isHour: false
      });
    }
  }
  
  return slots;
}

/**
 * Calculate the position and height of an event in the calendar grid
 */
export function calculateEventPosition(
  startUTC: string,
  durationMinutes: number,
  timezone: string,
  dayStartHour: number = 0
): { top: number; height: number; hour: number } {
  const startLocal = utcToLocal(startUTC, timezone);
  const hour = startLocal.hour + startLocal.minute / 60;
  
  // Calculate position relative to day start (0:00 = hour 0)
  const relativeHour = hour - dayStartHour;
  const top = relativeHour * 60; // 60px per hour
  const height = (durationMinutes / 60) * 60; // Convert minutes to pixels
  
  return { top, height, hour };
}

/**
 * Check if a time is within the visible calendar hours (24 hours: 00:00 - 23:59)
 */
export function isWithinCalendarHours(utcTime: string, timezone: string): boolean {
  const localTime = utcToLocal(utcTime, timezone);
  const hour = localTime.hour;
  return hour >= 0 && hour <= 23; // Always true for 24-hour view
}

/**
 * Get a formatted week range string (e.g., "Jan 20 - 26, 2025")
 * Shows Monday-Sunday range to match both our system and React Big Calendar
 */
export function getWeekRangeString(weekStartISO: string, timezone: string): string {
  const weekStart = DateTime.fromISO(weekStartISO, { zone: timezone });
  const weekEnd = weekStart.endOf('week');
  
  if (weekStart.month === weekEnd.month) {
    // Same month: "Sep 2 - 8, 2025"
    return `${weekStart.toFormat('MMM d')} - ${weekEnd.toFormat('d, yyyy')}`;
  } else {
    // Different months: "Aug 26 - Sep 1, 2025"
    return `${weekStart.toFormat('MMM d')} - ${weekEnd.toFormat('MMM d, yyyy')}`;
  }
}

/**
 * Parse a datetime string and ensure it's timezone-aware
 */
export function parseDateTime(dateTimeString: string, timezone: string): DateTime | null {
  try {
    // Try parsing as ISO string first (with timezone info)
    let dt = DateTime.fromISO(dateTimeString);
    
    // If no timezone info (like datetime-local input), assume specified timezone
    if (!dt.isValid || !dt.zone || dt.zone.name === 'local') {
      dt = DateTime.fromISO(dateTimeString, { zone: timezone });
    }
    
    return dt.isValid ? dt : null;
  } catch {
    return null;
  }
}

/**
 * Create a new DateTime in the specified timezone
 */
export function createDateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
): DateTime {
  return DateTime.fromObject(
    { year, month, day, hour, minute },
    { zone: timezone }
  );
}

/**
 * Get available timezone options for the selector
 */
export function getTimezoneOptions(): Array<{ value: string; label: string }> {
  return [
    { value: 'Europe/London', label: 'London (GMT/BST)' },
    { value: 'UTC', label: 'UTC (GMT+0)' },
    { value: 'America/New_York', label: 'New York (EST/EDT)' },
    { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
    { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)' }
  ];
}
