/**
 * Weekly calendar view component
 */

import React, { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  fetchOccurrences, 
  selectSelectedWeek, 
  selectTimezone, 
  selectLoading, 
  selectError,
  selectOccurrencesForWeek,
  clearError,
  clearOccurrences
} from '../features/calendar/slice';
import { openModal } from '../features/ui/slice';
import { getWeekInfo, getTimeSlots, calculateEventPosition, isWithinCalendarHours, localToUTC, utcToLocal } from '../lib/time';
import { createCacheKey, createOccurrenceOverride } from '../api/client';
import { Occurrence } from '../types';
import { AppDispatch } from '../store/store';
import { DateTime } from 'luxon';

const CalendarWeek: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  
  const selectedWeek = useSelector(selectSelectedWeek);
  const timezone = useSelector(selectTimezone);
  const loading = useSelector(selectLoading);
  const error = useSelector(selectError);

  // Drag and drop state
  const [draggedEvent, setDraggedEvent] = useState<Occurrence | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [previewTime, setPreviewTime] = useState<string>('');
  const [previewDay, setPreviewDay] = useState<string>('');
  const [dragStartPosition, setDragStartPosition] = useState({ x: 0, y: 0 });
  const [hasDraggedDistance, setHasDraggedDistance] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  
  // Helper function to create unique identifier for events
  const getEventId = (occurrence: Occurrence) => {
    return `${occurrence.series_id}-${occurrence.occurrence_start_utc}`;
  };

  // Helper function to format time range for events
  const formatTimeRange = (startTime: string, durationMinutes: number, timezone: string) => {
    console.log('formatTimeRange called with:', { startTime, durationMinutes, timezone });
    
    try {
      const start = utcToLocal(startTime, timezone);
      const end = start.plus({ minutes: durationMinutes });
      
      console.log('Start DateTime:', start.toISO());
      console.log('End DateTime:', end.toISO());
      
      const formatOptions = { 
        hour: '2-digit' as const, 
        minute: '2-digit' as const,
        hour12: false // Use 24-hour format
      };
      
      const startFormatted = start.toLocaleString(formatOptions);
      const endFormatted = end.toLocaleString(formatOptions);
      
      const result = `${startFormatted} to ${endFormatted}`;
      console.log('Formatted time range:', result);
      
      return result;
    } catch (error) {
      console.error('Error in formatTimeRange:', error);
      return 'Time error';
    }
  };
  
  const weekInfo = getWeekInfo(selectedWeek, timezone);
  const cacheKey = createCacheKey(weekInfo.weekStart, weekInfo.weekEnd, timezone);
  const occurrences = useSelector((state: any) => selectOccurrencesForWeek(state, cacheKey));
  
  const timeSlots = getTimeSlots();

  // Fetch occurrences when week or timezone changes
  useEffect(() => {
    console.log('Fetching occurrences for week:', weekInfo.weekStart, 'to', weekInfo.weekEnd);
    dispatch(fetchOccurrences({
      startISO: weekInfo.weekStart,
      endISO: weekInfo.weekEnd,
      timezone: 'UTC'
    }));
  }, [dispatch, weekInfo.weekStart, weekInfo.weekEnd, timezone]);

  // Drag and drop handlers
  const handleMouseDown = (event: React.MouseEvent, occurrence: Occurrence) => {
    event.preventDefault();
    event.stopPropagation();
    
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const calendarRect = calendarRef.current?.getBoundingClientRect();
    
    if (!calendarRect) return;
    
    const startPos = {
      x: event.clientX,
      y: event.clientY
    };
    
    setDragOffset({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    });
    
    setDragPosition({
      x: event.clientX,
      y: event.clientY
    });
    
    setDragStartPosition(startPos);
    setDraggedEvent(occurrence);
    setHasDraggedDistance(false);
    // Don't set isDragging true immediately - wait for movement
    
    console.log('Mouse down on event:', occurrence.title, 'is_exception:', occurrence.is_exception);
    console.log('Full occurrence data:', occurrence);
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!draggedEvent || !calendarRef.current) return;
    
    // Check if we've moved enough distance to start dragging
    if (!isDragging && !hasDraggedDistance) {
      const distance = Math.sqrt(
        Math.pow(event.clientX - dragStartPosition.x, 2) + 
        Math.pow(event.clientY - dragStartPosition.y, 2)
      );
      
      if (distance > 5) { // Start dragging after 5px movement
        setIsDragging(true);
        setHasDraggedDistance(true);
        console.log('Started dragging:', draggedEvent.title);
      } else {
        return; // Not enough movement yet
      }
    }
    
    if (!isDragging) return;
    
    event.preventDefault();
    
    const calendarRect = calendarRef.current.getBoundingClientRect();
    const gridElement = calendarRef.current.querySelector('.calendar-grid');
    if (!gridElement) return;
    
    // Update drag position (use screen coordinates for fixed positioning)
    setDragPosition({
      x: event.clientX,
      y: event.clientY
    });
    
    const gridRect = gridElement.getBoundingClientRect();
    const relativeY = event.clientY - gridRect.top;
    const relativeX = event.clientX - gridRect.left;

    const timeColumnWidth = 80;
    const dayColumnWidth = (gridRect.width - timeColumnWidth) / 7;
    const dayIndex = Math.floor((relativeX - timeColumnWidth) / dayColumnWidth);
    
    // Each time slot is 60px high and represents 1 hour
    const pixelsPerHour = 60;
    const newMinutesFromMidnight = Math.round((relativeY / pixelsPerHour) * 60);
    const snappedMinutes = Math.round(newMinutesFromMidnight / 15) * 15;
    
    if (dayIndex >= 0 && dayIndex < 7 && snappedMinutes >= 0 && snappedMinutes < 1440) {
      // Update preview time and day
      const targetDate = weekInfo.days[dayIndex];
      const newStartDateTime = DateTime.fromISO(targetDate.date, { zone: timezone })
        .startOf('day')
        .plus({ minutes: snappedMinutes });
      const newEndDateTime = newStartDateTime.plus({ minutes: draggedEvent?.duration_minutes || 30 });
      
      const formatOptions = { hour: '2-digit' as const, minute: '2-digit' as const, hour12: false };
      const startFormatted = newStartDateTime.toLocaleString(formatOptions);
      const endFormatted = newEndDateTime.toLocaleString(formatOptions);
      
      setPreviewTime(`${startFormatted} to ${endFormatted}`);
      setPreviewDay(targetDate.dayName);
    } else {
      setPreviewTime('');
      setPreviewDay('');
    }
  };

  const handleMouseUp = async (event: React.MouseEvent) => {
    if (!draggedEvent) return;
    
    event.preventDefault();
    
    // If we haven't dragged, this is a click - open the modal
    if (!hasDraggedDistance) {
      console.log('Click detected - opening modal for:', draggedEvent.title);
      handleEventClick(draggedEvent);
      
      // Reset drag state
      setDraggedEvent(null);
      setIsDragging(false);
      setHasDraggedDistance(false);
      return;
    }
    
    // If we have dragged, handle the drop
    if (!isDragging || !calendarRef.current) {
      console.log('MouseUp: Not dragging or missing data');
      return;
    }
    
    setIsDragging(false);
    
    console.log('MouseUp: Attempting to drop event');

    // Calculate new time based on drop position
    const calendarRect = calendarRef.current.getBoundingClientRect();
    const gridElement = calendarRef.current.querySelector('.calendar-grid');
    if (!gridElement) return;
    
    const gridRect = gridElement.getBoundingClientRect();
    const relativeY = event.clientY - gridRect.top;
    const relativeX = event.clientX - gridRect.left;

    // Calculate which day column (accounting for time column)
    const timeColumnWidth = 80;
    const dayColumnWidth = (gridRect.width - timeColumnWidth) / 7;
    const dayIndex = Math.floor((relativeX - timeColumnWidth) / dayColumnWidth);
    
    // Calculate time based on Y position (60px per hour)
    const pixelsPerHour = 60;
    const newMinutesFromMidnight = Math.round((relativeY / pixelsPerHour) * 60);
    
    // Snap to 15-minute intervals
    const snappedMinutes = Math.round(newMinutesFromMidnight / 15) * 15;
    
    console.log('Drop calculation:', { dayIndex, snappedMinutes, relativeX, relativeY });
    
    if (dayIndex >= 0 && dayIndex < 7 && snappedMinutes >= 0 && snappedMinutes < 1440) {
      const targetDate = weekInfo.days[dayIndex];
      console.log('Target date:', targetDate);
      
      const newDateTime = DateTime.fromISO(targetDate.date, { zone: timezone })
        .startOf('day')
        .plus({ minutes: snappedMinutes });

      const newUtcTime = localToUTC(newDateTime);
      console.log('New time:', { newDateTime: newDateTime.toISO(), newUtcTime });

      // Validate the new time
      if (!newUtcTime) {
        console.error('Failed to convert to UTC time');
        alert('Failed to convert time to UTC');
        return;
      }

      try {
        // For events that are already exceptions, we need to use the original occurrence time
        // For new events, we use the occurrence_start_utc directly
        const originalOccurrenceTime = draggedEvent.is_exception && draggedEvent.original_occurrence_start_utc 
          ? draggedEvent.original_occurrence_start_utc 
          : draggedEvent.occurrence_start_utc;
        
        const overrideData = {
          occurrence_start_utc: originalOccurrenceTime,
          override_start_utc: newUtcTime,
          override_duration_minutes: draggedEvent.duration_minutes,
          override_title: draggedEvent.title,
          override_link: draggedEvent.link || '',
          override_notes: draggedEvent.notes || ''
        };
        
        console.log('Event is_exception:', draggedEvent.is_exception);
        console.log('Using original occurrence time:', originalOccurrenceTime);
        
        console.log('Creating occurrence override with data:', overrideData);
        console.log('Series ID:', draggedEvent.series_id);
        console.log('API URL will be:', `http://localhost:8000/api/series/${draggedEvent.series_id}/occurrence/`);
        
        // Test API connectivity first
        try {
          const testResponse = await fetch('http://localhost:8000/api/series/');
          console.log('API connectivity test - status:', testResponse.status);
        } catch (testError) {
          console.error('API connectivity test failed:', testError);
          alert('Cannot connect to backend server. Make sure it\'s running on port 8000.');
          return;
        }
        
        // Create occurrence override with new time
        const result = await createOccurrenceOverride(draggedEvent.series_id, overrideData);
        console.log('Override created successfully:', result);

        // Refresh the calendar
        console.log('Refreshing calendar...');
        await dispatch(fetchOccurrences({
          startISO: weekInfo.weekStart,
          endISO: weekInfo.weekEnd,
          timezone: 'UTC'
        }));
        console.log('Calendar refreshed');
        console.log('Updated occurrences after drag:', occurrences.length);
      } catch (error) {
        console.error('Failed to move event:', error);
        console.error('Error details:', error);
        
        // Log more details about the error
        if (error && typeof error === 'object') {
          console.error('Error response:', (error as any).response?.data);
          console.error('Error status:', (error as any).response?.status);
          console.error('Error config:', (error as any).config);
        }
        
        // Show user-friendly error
        const errorMessage = (error as any).response?.data?.error || 
                           (error as any).message || 
                           'Unknown error';
        alert(`Failed to move event: ${errorMessage}`);
      }
    }

    // Reset drag state
    setDraggedEvent(null);
    setPreviewTime('');
    setPreviewDay('');
    setHasDraggedDistance(false);
  };

  const handleMouseLeave = () => {
    if (isDragging || draggedEvent) {
      setIsDragging(false);
      setDraggedEvent(null);
      setPreviewTime('');
      setPreviewDay('');
      setHasDraggedDistance(false);
    }
  };

  // Group occurrences by day
  const occurrencesByDay = React.useMemo(() => {
    const grouped: Record<string, Occurrence[]> = {};
    
    weekInfo.days.forEach(day => {
      grouped[day.date] = [];
    });
    
    console.log('Processing occurrences for grouping:', occurrences.length, 'total occurrences');
    console.log('Raw occurrences:', occurrences);
    
    occurrences.forEach((occ: Occurrence) => {
      // Use localStart if available, otherwise convert UTC to local
      const startTime = occ.localStart || occ.occurrence_start_utc;
      
      // Extract date part (YYYY-MM-DD)
      const dateStr = startTime.split('T')[0];
      
      if (grouped[dateStr] && isWithinCalendarHours(occ.occurrence_start_utc, timezone)) {
        grouped[dateStr].push(occ);
      }
    });
    
    console.log('Grouped occurrences by day:', grouped);
    return grouped;
  }, [occurrences, weekInfo.days, timezone]);

  const handleEventClick = (occurrence: Occurrence) => {
    console.log('Event clicked:', occurrence);
    dispatch(openModal(occurrence));
  };
  
  const handleTimeSlotClick = (day: string, hour: number, minute: number = 0) => {
    console.log('Time slot clicked:', { day, hour, minute });
    
    // Create a DateTime object for the clicked time
    const clickedTime = DateTime.fromISO(day, { zone: timezone })
      .startOf('day')
      .plus({ hours: hour, minutes: minute });
    
    console.log('Opening create modal for time:', clickedTime.toISO());
    
    // Store the selected time and default duration for the create modal FIRST
    localStorage.setItem('createEventTime', clickedTime.toFormat('yyyy-MM-dd\'T\'HH:mm'));
    localStorage.setItem('createEventDuration', '30'); // Default 30 minutes for time slot clicks
    
    console.log('📦 CalendarWeek stored time:', clickedTime.toFormat('yyyy-MM-dd\'T\'HH:mm'));
    
    // Then open create modal with the selected time
    dispatch(openCreateModal());
  };

  const handleClearError = () => {
    dispatch(clearError());
  };
  
  const handleForceRefresh = () => {
    console.log('Force refreshing calendar...');
    // Clear the cache first
    dispatch(clearOccurrences());
    // Then fetch fresh data
    dispatch(fetchOccurrences({
      startISO: weekInfo.weekStart,
      endISO: weekInfo.weekEnd,
      timezone: 'UTC'
    }));
  };

  if (error) {
    return (
      <div className="error">
        <p>Error loading calendar: {error}</p>
        <button onClick={handleClearError} className="btn btn-secondary">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div 
      className={`calendar-week ${isDragging ? 'dragging' : ''}`}
      ref={calendarRef}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* Calendar Header */}
      {/* Temporary debug controls */}
      <div style={{ padding: '10px', background: '#f0f0f0', marginBottom: '10px' }}>
        <button onClick={handleForceRefresh} style={{ marginRight: '10px', padding: '5px 10px' }}>
          🔄 Force Refresh
        </button>
        <span style={{ fontSize: '12px', color: '#666' }}>
          Debug: {occurrences.length} occurrences loaded
        </span>
      </div>

      <div className="calendar-header">
        <div className="time-column-header">Time</div>
        {weekInfo.days.map(day => (
          <div key={day.date} className="day-header">
            <span className="day-name">{day.dayName}</span>
            <span className={`day-date ${day.isToday ? 'today' : ''}`}>
              {day.dayNumber}
            </span>
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="calendar-grid">
        {/* Time column */}
        <div className="time-column">
          {timeSlots.map(slot => (
            <div 
              key={`${slot.hour}-${slot.minute}`} 
              className={`time-slot ${slot.isHour ? 'hour' : ''}`}
            >
              {slot.isHour && slot.label}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {weekInfo.days.map(day => (
          <div key={day.date} className="day-column">
            {/* Background grid lines with click handlers */}
            <div className="time-grid-lines">
              {timeSlots.map(slot => (
                <div 
                  key={`${slot.hour}-${slot.minute}`} 
                  className={`time-grid-line ${slot.isHour ? 'hour' : ''} clickable-time-slot`}
                  onClick={() => handleTimeSlotClick(day.date, slot.hour, slot.minute)}
                  title={`Create event at ${slot.hour.toString().padStart(2, '0')}:${slot.minute.toString().padStart(2, '0')}`}
                />
              ))}
            </div>



            {/* Events for this day */}
            {occurrencesByDay[day.date]?.map((occurrence, index) => {
              const startTime = occurrence.localStart || occurrence.occurrence_start_utc;
              const position = calculateEventPosition(
                occurrence.occurrence_start_utc, 
                occurrence.duration_minutes, 
                timezone
              );

              return (
                <div
                  key={`${occurrence.series_id}-${occurrence.occurrence_start_utc}-${index}`}
                  className={`event ${occurrence.is_exception ? 'exception' : ''} event-type-${occurrence.event_type?.toLowerCase() || 'event'} ${
                    isDragging && draggedEvent && getEventId(draggedEvent) === getEventId(occurrence) ? 'dragging' : ''
                  }`}
                  style={{
                    top: `${position.top}px`,
                    height: `${position.height}px`,
                    cursor: isDragging && draggedEvent && getEventId(draggedEvent) === getEventId(occurrence) ? 'grabbing' : 'grab',
                    opacity: isDragging && draggedEvent && getEventId(draggedEvent) === getEventId(occurrence) ? 0.3 : 1,
                    visibility: isDragging && draggedEvent && getEventId(draggedEvent) === getEventId(occurrence) ? 'hidden' : 'visible',
                    zIndex: isDragging && draggedEvent && getEventId(draggedEvent) === getEventId(occurrence) ? 1000 : 'auto',
                  }}
                  onMouseDown={(e) => handleMouseDown(e, occurrence)}
                  title={`${occurrence.title}\n${startTime}\nDuration: ${occurrence.duration_minutes} min${occurrence.notes ? '\n' + occurrence.notes : ''}`}
                >
                  <div className="event-title">{occurrence.title}</div>
                  <div className="event-type">
                    {occurrence.event_type === 'Meeting' && '🤝 Meeting'}
                    {occurrence.event_type === '1st' && '🥇 1st'}
                    {occurrence.event_type === 'Presentation' && '📊 Presentation'}
                    {occurrence.event_type === 'Event' && '📅 Event'}
                    {!occurrence.event_type && '📅 Event'}
                  </div>
                  <div className="event-time">
                    {(() => {
                      console.log('Rendering event time for:', occurrence.title);
                      console.log('occurrence_start_utc:', occurrence.occurrence_start_utc);
                      console.log('is_exception:', occurrence.is_exception);
                      console.log('original_occurrence_start_utc:', occurrence.original_occurrence_start_utc);
                      return formatTimeRange(occurrence.occurrence_start_utc, occurrence.duration_minutes, timezone);
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Floating dragged event */}
      {isDragging && draggedEvent && (
        <div
          className={`floating-event event-type-${draggedEvent.event_type?.toLowerCase() || 'event'}`}
          style={{
            position: 'fixed',
            left: `${dragPosition.x + 10}px`,
            top: `${dragPosition.y + 10}px`,
            height: `${draggedEvent.duration_minutes}px`,
            width: '140px',
            zIndex: 10000,
            pointerEvents: 'none',
            transform: 'rotate(2deg) scale(1.05)',
            boxShadow: '0 8px 16px rgba(0, 0, 0, 0.2)',
          }}
        >
          <div className="event-title">{draggedEvent.title}</div>
          <div className="event-type">
            {draggedEvent.event_type === 'Meeting' && '🤝 Meeting'}
            {draggedEvent.event_type === '1st' && '🥇 1st'}
            {draggedEvent.event_type === 'Presentation' && '📊 Presentation'}
            {draggedEvent.event_type === 'Event' && '📅 Event'}
            {!draggedEvent.event_type && '📅 Event'}
          </div>
          <div className="event-time">
            {previewTime && previewDay ? (
              <span className="preview-time">
                {previewDay} {previewTime}
              </span>
            ) : (
              formatTimeRange(draggedEvent.occurrence_start_utc, draggedEvent.duration_minutes, timezone)
            )}
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="loading">
          Loading calendar events...
        </div>
      )}
    </div>
  );
};

export default CalendarWeek;
