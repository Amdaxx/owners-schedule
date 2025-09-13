/**
 * Calendar state management with Redux Toolkit
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { CalendarState, Occurrence } from '../../types';
import { fetchOccurrences as apiFetchOccurrences, createCacheKey } from '../../api/client';
import { getCurrentWeekStart } from '../../lib/time';

// Async thunk for fetching occurrences
export const fetchOccurrences = createAsyncThunk(
  'calendar/fetchOccurrences',
  async (params: { startISO: string; endISO: string; timezone?: string }) => {
    const occurrences = await apiFetchOccurrences(params.startISO, params.endISO, params.timezone);
    return {
      occurrences,
      cacheKey: createCacheKey(params.startISO, params.endISO, params.timezone)
    };
  }
);

// Initial state
const initialState: CalendarState = {
  selectedWeekStartISO: getCurrentWeekStart('Europe/London'),
  timezone: 'Europe/London',
  occurrences: {},
  loading: false,
  error: null,
};

const calendarSlice = createSlice({
  name: 'calendar',
  initialState,
  reducers: {
    setSelectedWeek: (state, action: PayloadAction<string>) => {
      state.selectedWeekStartISO = action.payload;
    },
    
    setTimezone: (state, action: PayloadAction<string>) => {
      state.timezone = action.payload;
      // Clear cache when timezone changes as local times will be different
      state.occurrences = {};
    },
    
    clearError: (state) => {
      state.error = null;
    },
    
    clearOccurrences: (state) => {
      state.occurrences = {};
    },
    
    // Optimistic update for occurrence modifications
    updateOccurrenceOptimistic: (state, action: PayloadAction<{
      cacheKey: string;
      occurrenceStartUTC: string;
      updates: Partial<Occurrence>;
    }>) => {
      const { cacheKey, occurrenceStartUTC, updates } = action.payload;
      const occurrences = state.occurrences[cacheKey];
      
      if (occurrences) {
        const index = occurrences.findIndex(occ => occ.occurrence_start_utc === occurrenceStartUTC);
        if (index !== -1) {
          state.occurrences[cacheKey][index] = {
            ...occurrences[index],
            ...updates,
            is_exception: true
          };
        }
      }
    },
    
    // Remove occurrence optimistically (for deletions)
    removeOccurrenceOptimistic: (state, action: PayloadAction<{
      cacheKey: string;
      occurrenceStartUTC: string;
    }>) => {
      const { cacheKey, occurrenceStartUTC } = action.payload;
      const occurrences = state.occurrences[cacheKey];
      
      if (occurrences) {
        state.occurrences[cacheKey] = occurrences.filter(
          occ => occ.occurrence_start_utc !== occurrenceStartUTC
        );
      }
    }
  },
  
  extraReducers: (builder) => {
    builder
      .addCase(fetchOccurrences.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOccurrences.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        state.occurrences[action.payload.cacheKey] = action.payload.occurrences;
      })
      .addCase(fetchOccurrences.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch occurrences';
      });
  },
});

export const {
  setSelectedWeek,
  setTimezone,
  clearError,
  clearOccurrences,
  updateOccurrenceOptimistic,
  removeOccurrenceOptimistic
} = calendarSlice.actions;

export default calendarSlice.reducer;

// Selectors
export const selectCalendarState = (state: { calendar: CalendarState }) => state.calendar;
export const selectSelectedWeek = (state: { calendar: CalendarState }) => state.calendar.selectedWeekStartISO;
export const selectTimezone = (state: { calendar: CalendarState }) => state.calendar.timezone;
export const selectLoading = (state: { calendar: CalendarState }) => state.calendar.loading;
export const selectError = (state: { calendar: CalendarState }) => state.calendar.error;

// Memoized empty array to prevent unnecessary re-renders
const EMPTY_ARRAY: any[] = [];

export const selectOccurrencesForWeek = (state: { calendar: CalendarState }, cacheKey: string) => 
  state.calendar.occurrences[cacheKey] || EMPTY_ARRAY;
