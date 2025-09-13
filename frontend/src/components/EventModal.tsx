/**
 * This is our event modal - it pops up when you want to create or edit an event
 * Handles all the form stuff and talks to the backend
 */

import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  closeModal, 
  selectSelectedOccurrence,
  selectCreateEventTime,
  selectCreateEventDuration
} from '../features/ui/slice';
import { 
  fetchOccurrences,
  updateOccurrenceOptimistic, 
  removeOccurrenceOptimistic,
  selectSelectedWeek,
  selectTimezone
} from '../features/calendar/slice';
import { 
  createOccurrenceOverride, 
  deleteOccurrence, 
  deleteEventSeries,
  createEventSeries,
  updateEventSeries,
  createCacheKey 
} from '../api/client';
import { utcToLocal, localToUTC, formatDateTime, getWeekInfo, parseDateTime } from '../lib/time';
import { DateTime } from 'luxon';
import { AppDispatch } from '../store/store';

const EventModal: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const occurrence = useSelector(selectSelectedOccurrence);
  const selectedWeek = useSelector(selectSelectedWeek);
  const timezone = useSelector(selectTimezone);
  const createEventTime = useSelector(selectCreateEventTime);
  const createEventDuration = useSelector(selectCreateEventDuration);
  
  // Let's see what data we have to work with
  console.log('🔍 COMPONENT CREATION - Redux state:');
  console.log('   - createEventTime:', createEventTime);
  console.log('   - createEventDuration:', createEventDuration);

  const getInitialStartTime = () => {
    if (createEventTime) {
      console.log('🎯 DIRECT INIT: Found time in Redux:', createEventTime);
      return createEventTime;
    }
    
    // If no time was selected, default to 9 AM
    const weekInfo = getWeekInfo(selectedWeek, timezone);
    const weekStart = DateTime.fromISO(weekInfo.weekStart, { zone: timezone });
    const defaultTime = weekStart.set({ hour: 9, minute: 0 });
    const formatted = defaultTime.toFormat('yyyy-MM-dd\'T\'HH:mm');
    console.log('🎯 DIRECT INIT: Using default time:', formatted);
    return formatted;
  };

  const getInitialDuration = () => {
    if (createEventDuration && createEventDuration > 0) {
      console.log('🎯 DIRECT INIT: Found duration in Redux:', createEventDuration);
      return createEventDuration;
    }
    console.log('🎯 DIRECT INIT: Using default duration: 30');
    return 30;
  };

  // All the form fields we need to track
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState(getInitialStartTime);
  const [duration, setDuration] = useState<number | string>(getInitialDuration);
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState('');
  const [frequency, setFrequency] = useState<'NEVER' | 'DAILY' | 'WORKDAY' | 'WEEKLY' | 'FORTNIGHTLY'>('NEVER');
  const [eventType, setEventType] = useState<'Meeting' | '1st' | 'Presentation' | 'Event'>('Meeting');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState<'single' | 'series' | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const [selectedHost, setSelectedHost] = useState<string>('');
  
  // Are we creating a new event or editing an existing one?
  const isCreateMode = !occurrence;

  // Fill in the form with existing data if we're editing
  useEffect(() => {
    if (occurrence) {
      console.log('📝 Edit mode - populating with existing data');
      // We're editing an existing event, so fill in all the fields
      setTitle(occurrence.title);
      setLink(occurrence.link);
      setNotes(occurrence.notes);
      setDuration(occurrence.duration_minutes);
      const occurrenceEventType = occurrence.event_type as 'Meeting' | '1st' | 'Presentation' | 'Event' || 'Event';
      setEventType(occurrenceEventType);
      // Only set location for Event type
      setLocation(occurrenceEventType === 'Event' ? (occurrence.location || '') : '');
      setSelectedHost(occurrence.host || '');
      
      try {
        // Convert UTC time to local for the time input
        const localDateTime = occurrence.localStart ? 
          parseDateTime(occurrence.localStart, timezone) :
          utcToLocal(occurrence.occurrence_start_utc, timezone);
        
        if (localDateTime && localDateTime.isValid) {
          // Format for datetime-local input (YYYY-MM-DDTHH:mm)
          const formatted = localDateTime.toFormat('yyyy-MM-dd\'T\'HH:mm');
          setStartTime(formatted);
          console.log('📝 Edit mode startTime set to:', formatted);
        } else {
          console.error('Invalid datetime for occurrence:', occurrence);
        }
      } catch (error) {
        console.error('Error converting datetime:', error);
      }
    } else {
      console.log('🆕 Create mode - using initial state (already set from localStorage)');
      console.log('🆕 Current startTime:', startTime);
      console.log('🆕 Current duration:', duration);
    }
  }, [occurrence, timezone]);

  // Clear location when event type is not 'Event'
  useEffect(() => {
    if (eventType !== 'Event') {
      setLocation('');
    }
  }, [eventType]);

  const handleClose = () => {
    dispatch(closeModal());
    setError(null);
    setDeleteMode(null);
    setShowDeleteConfirm(false);
    setShowUpdateConfirm(false);
    
    // Clean up any remaining localStorage items
    localStorage.removeItem('createEventTime');
    localStorage.removeItem('createEventDuration');
  };

  const handleDeleteClick = () => {
    if (!occurrence) return;
    
    // Check if this is a recurring event (not NEVER frequency)
    if (occurrence.frequency === 'NEVER') {
      // One-time event - delete directly without confirmation
      handleDelete('single');
    } else {
      // Recurring event - show confirmation dialog
      setShowDeleteConfirm(true);
    }
  };

  const handleConfirmDelete = (mode: 'single' | 'series') => {
    setDeleteMode(mode);
    setShowDeleteConfirm(false);
    handleDelete(mode);
  };

  const handleSaveClick = () => {
    if (isCreateMode || !occurrence) {
      // Create mode or no occurrence - save directly
      handleSave();
      return;
    }

    // Edit mode - check if it's a recurring event
    if (occurrence.frequency === 'NEVER') {
      // One-time event - save directly
      handleSave();
    } else {
      // Recurring event - show confirmation dialog
      setShowUpdateConfirm(true);
    }
  };

  const handleConfirmUpdate = (mode: 'single' | 'series') => {
    setShowUpdateConfirm(false);
    handleSave(mode);
  };

  const handleSave = async (updateMode?: 'single' | 'series') => {
    
    setIsSubmitting(true);
    setError(null);

    // Add a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.error('Event creation timed out');
      setError('Request timed out. Please try again.');
      setIsSubmitting(false);
    }, 30000); // 30 second timeout

    try {
      // Validate required fields
      if (!title.trim()) {
        setError('Event title is required');
        clearTimeout(timeoutId);
        setIsSubmitting(false);
        return;
      }

      if (!startTime) {
        setError('Start time is required');
        clearTimeout(timeoutId);
        setIsSubmitting(false);
        return;
      }

      const localDateTime = parseDateTime(startTime, timezone);
      
      if (!localDateTime || !localDateTime.isValid) {
        setError('Invalid start time format');
        clearTimeout(timeoutId);
        setIsSubmitting(false);
        return;
      }
      const utcStartTime = localToUTC(localDateTime);

      if (isCreateMode) {
        // Create new event series
        const seriesData = {
          title,
          start_utc: utcStartTime,
          duration_minutes: Number(duration) || 30,
          freq: frequency,
          interval: frequency === 'FORTNIGHTLY' ? 2 : 1,
          byweekday: [],
          link: link || '',
          notes: notes || '',
          location: eventType === 'Event' ? (location || '') : '',
          host: selectedHost || '',
          event_type: eventType
        };

        const result = await createEventSeries(seriesData);

        // Refresh the calendar to show the new event
        const weekInfo = getWeekInfo(selectedWeek, timezone);
        await dispatch(fetchOccurrences({
          startISO: weekInfo.weekStart,
          endISO: weekInfo.weekEnd,
          timezone: 'UTC'
        }));

        handleClose();
      } else if (occurrence) {
        if (updateMode === 'series') {
          // Update the entire series
          const seriesUpdateData = {
            title,
            start_utc: utcStartTime,
            duration_minutes: Number(duration) || 30,
            link: link || '',
            notes: notes || '',
            location: eventType === 'Event' ? (location || '') : '',
            host: selectedHost || '',
            event_type: eventType
          };

          // Update the entire event series
          await updateEventSeries(occurrence.series_id, {
            id: occurrence.series_id,
            ...seriesUpdateData
          });
          
          // Refresh the calendar to show all updated events
          const weekInfo = getWeekInfo(selectedWeek, timezone);
          await dispatch(fetchOccurrences({
            startISO: weekInfo.weekStart,
            endISO: weekInfo.weekEnd,
            timezone: 'UTC'
          }));
          
          handleClose();
        } else {
          // Edit just this occurrence (default behavior)
          // For events that are already exceptions, we need to use the original occurrence time
          const originalOccurrenceTime = occurrence.is_exception && occurrence.original_occurrence_start_utc 
            ? occurrence.original_occurrence_start_utc 
            : occurrence.occurrence_start_utc;
            
          const overrideData = {
            occurrence_start_utc: originalOccurrenceTime,
            override_start_utc: utcStartTime,
            override_duration_minutes: Number(duration) || 30,
            override_title: title,
            override_link: link,
            override_notes: notes,
            override_location: eventType === 'Event' ? location : '',
            override_host: selectedHost
          };

          const result = await createOccurrenceOverride(occurrence.series_id, overrideData);

          // Refresh the calendar to show the updated event
          const weekInfo = getWeekInfo(selectedWeek, timezone);
          await dispatch(fetchOccurrences({
            startISO: weekInfo.weekStart,
            endISO: weekInfo.weekEnd,
            timezone: 'UTC'
          }));

          handleClose();
        }
      }
    } catch (err: any) {
      console.error('Save error:', err);
      let errorMessage = 'Failed to save changes';
      
      if (err.response?.data) {
        // Extract specific validation errors from API response
        const apiError = err.response.data;
        if (typeof apiError === 'object') {
          const errorDetails = Object.entries(apiError)
            .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
            .join('; ');
          errorMessage = errorDetails || err.message || errorMessage;
        } else if (typeof apiError === 'string') {
          errorMessage = apiError;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      clearTimeout(timeoutId);
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (mode: 'single' | 'series') => {
    if (!occurrence) return;

    const isSingle = mode === 'single';
    const confirmMessage = isSingle 
      ? 'Are you sure you want to delete this single occurrence? This will only remove this one event from the series.'
      : 'Are you sure you want to delete the entire event series? This will remove ALL occurrences of this event and cannot be undone.';

    const confirmed = window.confirm(confirmMessage);
    
    if (!confirmed) return;

    setIsSubmitting(true);
    setError(null);

    try {
      if (isSingle) {
        // Delete single occurrence
        await deleteOccurrence(occurrence.series_id, occurrence.occurrence_start_utc);
      } else {
        // Delete entire series
        await deleteEventSeries(occurrence.series_id);
      }

      // Force a fresh fetch instead of optimistic update
      const weekInfo = getWeekInfo(selectedWeek, timezone);
      await dispatch(fetchOccurrences({
        startISO: weekInfo.weekStart,
        endISO: weekInfo.weekEnd,
        timezone: 'UTC'
      }));

      handleClose();
    } catch (err: any) {
      const errorMessage = isSingle 
        ? 'Failed to delete occurrence'
        : 'Failed to delete event series';
      setError(err.message || errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Don't render if modal should be closed (but allow create mode)
  if (!isCreateMode && !occurrence) return null;

  const localStartDateTime = occurrence ? (
    occurrence.localStart ? 
      parseDateTime(occurrence.localStart, timezone) :
      utcToLocal(occurrence.occurrence_start_utc, timezone)
  ) : null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{isCreateMode ? 'Create New Event' : 'Edit Event'}</h2>
        </div>

        <div className="modal-body">
          {error && (
            <div className="error">
              {error}
            </div>
          )}

          {!isCreateMode && occurrence && (
            <>
              <div className="form-group">
                <label className="form-label">Original Event:</label>
                <p>{occurrence.title}</p>
                <p>{localStartDateTime && localStartDateTime.isValid ? formatDateTime(localStartDateTime) : 'Invalid date'} ({occurrence.duration_minutes} min)</p>
              </div>

            </>
          )}

          <div className="form-group">
                <label htmlFor="event-title" className="form-label">Title:</label>
                <input
                  id="event-title"
                  type="text"
                  className="form-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Event title"
                />
              </div>

              {/* Event Type - Editable in create mode, read-only in edit mode */}
              <div className="form-group">
                <label className="form-label">Event Type:</label>
                {isCreateMode ? (
                  <div className="event-type-selector">
                    <div 
                      className={`event-type-option ${eventType === 'Meeting' ? 'selected' : ''}`}
                      onClick={() => setEventType('Meeting')}
                      title="Meeting"
                      data-type="Meeting"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                      </svg>
                      <span>🤝 Meeting</span>
                    </div>
                    <div 
                      className={`event-type-option ${eventType === '1st' ? 'selected' : ''}`}
                      onClick={() => setEventType('1st')}
                      title="1st"
                      data-type="1st"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                      <span>🥇 1st</span>
                    </div>
                    <div 
                      className={`event-type-option ${eventType === 'Presentation' ? 'selected' : ''}`}
                      onClick={() => setEventType('Presentation')}
                      title="Presentation"
                      data-type="Presentation"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                        <line x1="8" y1="21" x2="16" y2="21"/>
                        <line x1="12" y1="17" x2="12" y2="21"/>
                      </svg>
                      <span>📊 Presentation</span>
                    </div>
                    <div 
                      className={`event-type-option ${eventType === 'Event' ? 'selected' : ''}`}
                      onClick={() => setEventType('Event')}
                      title="Event"
                      data-type="Event"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                      <span>📅 Event</span>
                    </div>
                  </div>
                ) : (
                  <div className="event-type-display">
                    <div className="event-type-badge" data-type={eventType}>
                      <span className="event-type-emoji">
                        {eventType === 'Meeting' && '🤝'}
                        {eventType === '1st' && '🥇'}
                        {eventType === 'Presentation' && '📊'}
                        {eventType === 'Event' && '📅'}
                      </span>
                      <span className="event-type-text">{eventType}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="event-host" className="form-label">Host:</label>
                <select
                  id="event-host"
                  className="form-input"
                  value={selectedHost}
                  onChange={(e) => setSelectedHost(e.target.value)}
                >
                  <option value="">Select a host...</option>
                  <option value="John Doe">John Doe</option>
                  <option value="Jane Smith">Jane Smith</option>
                  <option value="Mike Johnson">Mike Johnson</option>
                  <option value="Sarah Wilson">Sarah Wilson</option>
                  <option value="David Brown">David Brown</option>
                  <option value="Lisa Davis">Lisa Davis</option>
                </select>
              </div>

              {isCreateMode && (
                <div className="form-group">
                  <label htmlFor="event-frequency" className="form-label">Frequency:</label>
                  <select
                    id="event-frequency"
                    className="form-input"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as any)}
                  >
                    <option value="NEVER">One-time event</option>
                    <option value="DAILY">Daily</option>
                    <option value="WORKDAY">Workdays (Mon-Fri)</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="FORTNIGHTLY">Fortnightly</option>
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Start Time:</label>
                {/* Debug info */}
                <div className="datetime-picker">
                  <div className="datetime-input">
                    <div className="date-section">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                      <input
                        type="date"
                        className="date-input"
                        value={startTime.split('T')[0] || ''}
                        onChange={(e) => {
                          console.log('📅 Date input value:', startTime.split('T')[0] || '');
                          const timePart = startTime.split('T')[1] || '09:00';
                          const newStartTime = `${e.target.value}T${timePart}`;
                          console.log('📅 Date changed to:', e.target.value, 'New startTime:', newStartTime);
                          setStartTime(newStartTime);
                        }}
                      />
                    </div>
                    <div className="time-section">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12,6 12,12 16,14"/>
                      </svg>
                      <input
                        type="time"
                        className="time-input"
                        value={startTime.split('T')[1] || '09:00'}
                        onChange={(e) => {
                          console.log('🕐 Time input value:', startTime.split('T')[1] || '09:00');
                          const datePart = startTime.split('T')[0] || new Date().toISOString().split('T')[0];
                          const newStartTime = `${datePart}T${e.target.value}`;
                          console.log('🕐 Time changed to:', e.target.value, 'New startTime:', newStartTime);
                          setStartTime(newStartTime);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="event-duration" className="form-label">Duration (minutes):</label>
                <input
                  id="event-duration"
                  type="number"
                  className="form-input"
                  value={duration}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDuration(value); // Allow any value including empty string
                  }}
                  onBlur={(e) => {
                    // Set default value when field loses focus if it's empty or invalid
                    if (duration === '' || duration === 0 || isNaN(Number(duration)) || Number(duration) < 1) {
                      setDuration(30);
                    }
                  }}
                  min="1"
                  max="480"
                />
              </div>

              <div className="form-group">
                <label htmlFor="event-link" className="form-label">Link:</label>
                <input
                  id="event-link"
                  type="url"
                  className="form-input"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>

              {/* Location field - only show for Event type */}
              {eventType === 'Event' && (
                <div className="form-group">
                  <label htmlFor="event-location" className="form-label">Location:</label>
                  <input
                    id="event-location"
                    type="text"
                    className="form-input"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Meeting room, address, or online platform"
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="event-notes" className="form-label">Notes:</label>
                <textarea
                  id="event-notes"
                  className="form-input form-textarea"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional notes..."
                />
              </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            onClick={handleClose}
            className="btn btn-secondary"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          
          {!isCreateMode && (
            <button
              type="button"
              onClick={handleDeleteClick}
              className="btn btn-danger"
              disabled={isSubmitting}
              title={occurrence?.frequency === 'NEVER' ? 'Delete this event' : 'Delete event(s)'}
            >
              {isSubmitting ? 'Deleting...' : 'Delete Event'}
            </button>
          )}
          
          <button
            type="button"
            onClick={handleSaveClick}
            className="btn btn-primary"
            disabled={isSubmitting || !title.trim()}
          >
            {isSubmitting ? 'Saving...' : (isCreateMode ? 'Create Event' : 'Save Changes')}
          </button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal modal-small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Delete Event</h3>
            </div>
            <div className="modal-body">
              <p>This is a recurring event. What would you like to delete?</p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDelete('single')}
                className="btn btn-danger"
              >
                Delete This Event Only
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDelete('series')}
                className="btn btn-danger"
              >
                Delete All Events
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Confirmation Dialog */}
      {showUpdateConfirm && (
        <div className="modal-overlay" onClick={() => setShowUpdateConfirm(false)}>
          <div className="modal modal-small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Update Event</h3>
            </div>
            <div className="modal-body">
              <p>This is a recurring event. What would you like to update?</p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setShowUpdateConfirm(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmUpdate('single')}
                className="btn btn-primary"
              >
                Update This Event Only
              </button>
              <button
                type="button"
                onClick={() => handleConfirmUpdate('series')}
                className="btn btn-primary"
              >
                Update All Events
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventModal;
