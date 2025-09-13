/**
 * This is our API client - it handles all the talking to the backend
 * Makes sure we send the right data and handle errors properly
 */

import axios from 'axios';
import {
  EventSeries,
  EventException,
  Occurrence,
  OccurrencesResponse,
  CreateSeriesRequest,
  UpdateSeriesRequest,
  CreateOccurrenceOverrideRequest,
  SplitSeriesRequest,
  SplitSeriesResponse
} from '../types';

// Set up our API connection with some sensible defaults
const api = axios.create({
  baseURL: 'http://localhost:8000/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // Give it 10 seconds to respond
});

// Log all our API calls when we're in development mode
if (import.meta.env.DEV) {
  api.interceptors.request.use(
    (config) => {
      console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`, config.data);
      return config;
    },
    (error) => {
      console.error('API Request Error:', error);
      return Promise.reject(error);
    }
  );
}

// Handle responses and catch any errors that come back
api.interceptors.response.use(
  (response) => {
    if (import.meta.env.DEV) {
      console.log(`API Response: ${response.config.method?.toUpperCase()} ${response.config.url}`, response.data);
    }
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.response?.data || error.message);
    
    // Handle different types of errors gracefully
    if (error.response?.status === 401) {
      // Someone needs to log in
      console.warn('Authentication required');
    } else if (error.response?.status >= 500) {
      // Something went wrong on the server
      console.error('Server error occurred');
    }
    
    return Promise.reject(error);
  }
);

/**
 * Get all the events that happen between these two dates
 */
export async function fetchOccurrences(
  startISO: string,
  endISO: string,
  timezone?: string
): Promise<Occurrence[]> {
  const params: Record<string, string> = {
    start: startISO,
    end: endISO,
  };
  
  if (timezone) {
    params.tz = timezone;
  }
  
  const response = await api.get<OccurrencesResponse>('/occurrences/', { params });
  return response.data.occurrences;
}

/**
 * Get all event series
 */
export async function fetchEventSeries(): Promise<EventSeries[]> {
  const response = await api.get<EventSeries[]>('/series/');
  return response.data;
}

/**
 * Get a specific event series by ID
 */
export async function fetchEventSeriesById(id: number): Promise<EventSeries> {
  const response = await api.get<EventSeries>(`/series/${id}/`);
  return response.data;
}

/**
 * Create a new event series
 */
export async function createEventSeries(data: CreateSeriesRequest): Promise<EventSeries> {
  const response = await api.post<EventSeries>('/series/', data);
  return response.data;
}

/**
 * Update an existing event series
 */
export async function updateEventSeries(id: number, data: UpdateSeriesRequest): Promise<EventSeries> {
  const response = await api.put<EventSeries>(`/series/${id}/`, data);
  return response.data;
}

/**
 * Delete an event series
 */
export async function deleteEventSeries(id: number): Promise<void> {
  await api.delete(`/series/${id}/`);
}

/**
 * Create or update an occurrence override
 */
export async function createOccurrenceOverride(
  seriesId: number,
  data: CreateOccurrenceOverrideRequest
): Promise<EventException> {
  const response = await api.post<EventException>(`/series/${seriesId}/occurrence/`, data);
  return response.data;
}

/**
 * Delete a specific occurrence
 */
export async function deleteOccurrence(
  seriesId: number,
  occurrenceStartUTC: string
): Promise<void> {
  await api.delete(`/series/${seriesId}/occurrence/`, {
    params: { occurrence_start_utc: occurrenceStartUTC }
  });
}

/**
 * Split a series at a specific occurrence ("Edit all future")
 */
export async function splitSeries(
  seriesId: number,
  data: SplitSeriesRequest
): Promise<SplitSeriesResponse> {
  const response = await api.post<SplitSeriesResponse>(`/series/${seriesId}/split/`, data);
  return response.data;
}

/**
 * Health check endpoint (if available)
 */
export async function healthCheck(): Promise<{ status: string }> {
  try {
    const response = await api.get('/health/');
    return response.data;
  } catch (error) {
    // If no health endpoint, just return based on successful request
    return { status: 'ok' };
  }
}

// Export the axios instance for custom requests if needed
export { api };

// Error handling utilities
export class APIError extends Error {
  public status?: number;
  public data?: any;

  constructor(message: string, status?: number, data?: any) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Handle API errors and convert to APIError instances
 */
export function handleAPIError(error: any): APIError {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error || 
                   error.response?.data?.message || 
                   error.message || 
                   'An API error occurred';
    
    return new APIError(
      message,
      error.response?.status,
      error.response?.data
    );
  }
  
  return new APIError(error.message || 'An unknown error occurred');
}

/**
 * Utility to create cache keys for occurrences
 */
export function createCacheKey(startISO: string, endISO: string, timezone?: string): string {
  return timezone ? `${startISO}|${endISO}|${timezone}` : `${startISO}|${endISO}`;
}
