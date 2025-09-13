/**
 * Type definitions for the Owner's Schedule application
 */

export interface EventSeries {
  id: number;
  title: string;
  start_utc: string;
  duration_minutes: number;
  freq: 'NEVER' | 'DAILY' | 'WORKDAY' | 'WEEKLY' | 'FORTNIGHTLY';
  byweekday: string[];
  interval: number;
  until_utc?: string;
  link: string;
  notes: string;
  event_type?: 'Meeting' | '1st' | 'Presentation' | 'Event';
  is_deleted: boolean;
  created_at: string;
  exceptions?: EventException[];
}

export interface EventException {
  id: number;
  series: number;
  occurrence_start_utc: string;
  deleted: boolean;
  override_start_utc?: string;
  override_duration_minutes?: number;
  override_title?: string;
  override_link?: string;
  override_notes?: string;
  created_at: string;
}

export interface Occurrence {
  series_id: number;
  occurrence_start_utc: string;
  original_occurrence_start_utc?: string; // For exceptions, the original occurrence time
  duration_minutes: number;
  title: string;
  link: string;
  notes: string;
  location: string;
  host: string;
  event_type?: 'Meeting' | '1st' | 'Presentation' | 'Event';
  is_exception: boolean;
  frequency: 'NEVER' | 'DAILY' | 'WORKDAY' | 'WEEKLY' | 'FORTNIGHTLY'; // Series frequency
  localStart?: string; // Added by server when tz parameter is provided
}

export interface OccurrencesResponse {
  occurrences: Occurrence[];
}

// UI State types
export interface CalendarState {
  selectedWeekStartISO: string;
  timezone: string;
  occurrences: Record<string, Occurrence[]>; // Keyed by "startISO|endISO"
  loading: boolean;
  error: string | null;
}

export interface UIState {
  selectedOccurrence: Occurrence | null;
  modalOpen: boolean;
  editScope: 'this' | 'future' | 'all';
  createEventTime: string | null;
  createEventDuration: number | null;
}

// API types
export interface CreateSeriesRequest {
  title: string;
  start_utc: string;
  duration_minutes: number;
  freq: EventSeries['freq'];
  byweekday?: string[];
  interval?: number;
  until_utc?: string;
  link?: string;
  notes?: string;
  location?: string;
  host?: string;
  event_type?: 'Meeting' | '1st' | 'Presentation' | 'Event';
}

export interface UpdateSeriesRequest extends Partial<CreateSeriesRequest> {
  id: number;
}

export interface CreateOccurrenceOverrideRequest {
  occurrence_start_utc: string;
  override_start_utc?: string;
  override_duration_minutes?: number;
  override_title?: string;
  override_link?: string;
  override_notes?: string;
  override_location?: string;
  override_host?: string;
  override_event_type?: 'Meeting' | '1st' | 'Presentation' | 'Event';
}

export interface SplitSeriesRequest {
  occurrence_start_utc: string;
  updates?: Partial<CreateSeriesRequest>;
}

export interface SplitSeriesResponse {
  original_series: EventSeries;
  new_series: EventSeries;
}

// Time utilities types
export interface WeekInfo {
  weekStart: string; // ISO string
  weekEnd: string; // ISO string
  days: DayInfo[];
}

export interface DayInfo {
  date: string; // ISO string
  dayName: string;
  dayNumber: number;
  isToday: boolean;
}

export interface TimeSlot {
  hour: number;
  minute: number;
  label: string;
  isHour: boolean; // true for hour markers (9:00), false for half-hours (9:30)
}
