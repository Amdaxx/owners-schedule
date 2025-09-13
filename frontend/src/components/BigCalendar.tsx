  /**
   * Our main calendar component that brings everything together
   * Uses react-big-calendar as the foundation and adds our custom features
   */

  import React, { useCallback, useMemo, useEffect, useState } from 'react';
  import { Calendar, momentLocalizer, Event } from 'react-big-calendar';
  import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
  import moment from 'moment';
  import { useDispatch, useSelector } from 'react-redux';
  // We used to use date-fns-tz but switched to moment for consistency
  import { 
    selectSelectedWeek, 
    selectTimezone, 
    selectOccurrencesForWeek,
    fetchOccurrences 
  } from '../features/calendar/slice';
  import { openModal, openCreateModalWithParams, setSelectedOccurrence } from '../features/ui/slice';
  import { getWeekInfo } from '../lib/time';
  import { createCacheKey, createOccurrenceOverride } from '../api/client';
  import { Occurrence } from '../types';
  import { AppDispatch } from '../store/store';
  import { useUndoRedo } from '../hooks/useUndoRedo';

  // Bring in the calendar styles so it looks good
  import 'react-big-calendar/lib/css/react-big-calendar.css';
  import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';

  // Make sure Monday starts the week (because that makes more sense)
  moment.updateLocale('en', {
    week: {
      dow: 1, // Monday is the first day of the week
    }
  });
  const localizer = momentLocalizer(moment);

  // Add drag and drop superpowers to the calendar
  const DragAndDropCalendar = withDragAndDrop(Calendar);

  // Let's make sure drag and drop is working properly
  console.log('🔍 DragAndDropCalendar:', DragAndDropCalendar);
  console.log('🔍 withDragAndDrop:', withDragAndDrop);

  // Keep a backup of the regular calendar just in case
  const TestCalendar = Calendar;

  // This is how we tell TypeScript what our events look like
  interface CalendarEvent extends Event {
    id: string;
    occurrence: Occurrence;
    resource?: any;
  }


  const BigCalendar: React.FC = () => {
    const dispatch = useDispatch<AppDispatch>();
    const selectedWeek = useSelector(selectSelectedWeek);
    const timezone = useSelector(selectTimezone);
    
    const weekInfo = getWeekInfo(selectedWeek, timezone);
    const cacheKey = createCacheKey(weekInfo.weekStart, weekInfo.weekEnd, 'UTC'); // Always use UTC cache
    const occurrences = useSelector((state: any) => selectOccurrencesForWeek(state, cacheKey));
    
    // Keep track of which event is selected for keyboard navigation
    const [selectedEventIndex, setSelectedEventIndex] = useState<number>(-1);
    
    // Get our undo/redo superpowers
    const { addAction } = useUndoRedo();
    
    
    

    // Load events when the component starts up or when we change weeks
    useEffect(() => {
      dispatch(fetchOccurrences({
        startISO: weekInfo.weekStart,
        endISO: weekInfo.weekEnd,
        timezone: 'UTC' // Always fetch UTC data, handle timezone conversion on frontend
      }));
    }, [dispatch, weekInfo.weekStart, weekInfo.weekEnd]);


  // This is where the magic happens - we turn our data into calendar events
  const events: CalendarEvent[] = useMemo(() => {
    if (!occurrences || occurrences.length === 0) {
      return [];
    }

    // First, let's create our basic events and handle timezone stuff
    const basicEvents = occurrences.map((occurrence: Occurrence, index: number) => {
      // Start with UTC time as our foundation
      const utcTime = new Date(occurrence.occurrence_start_utc);
      
      // Figure out the timezone offset (this gets tricky with daylight saving time)
      const getTimezoneOffsetMinutes = (tz: string): number => {
        // Pick a random date to calculate the offset (we use a fixed date for consistency)
        const testDate = new Date('2024-01-15T12:00:00Z'); // Use a fixed date for consistent offset
        
        // Calculate how many minutes difference there is
        const utcTime = testDate.getTime();
        const localTime = new Date(testDate.toLocaleString('en-US', { timeZone: tz })).getTime();
        const offsetMs = localTime - utcTime;
        
        return Math.round(offsetMs / 60000); // Convert to minutes
      };
      
      // Adjust the time for the user's timezone
      const offsetMinutes = getTimezoneOffsetMinutes(timezone);
      const start = new Date(utcTime.getTime() + (offsetMinutes * 60000));
      const end = new Date(start.getTime() + occurrence.duration_minutes * 60000);
      
      return {
        occurrence,
        start,
        end,
        index
      };
    });

    // Now let's figure out which events overlap so we can display them side by side
    const eventsWithOverlap = basicEvents.map((event, index) => {
      let eventsAtSameTime = 0;
      let myPosition = 0;
      
      // Look for other events that start around the same time (within 1 minute)
      basicEvents.forEach((otherEvent, otherIndex) => {
        const timeDiff = Math.abs(event.start.getTime() - otherEvent.start.getTime());
        if (timeDiff < 60000) {
          eventsAtSameTime++;
          if (otherIndex < index) {
            myPosition++;
          }
        }
      });
      
      return {
        ...event,
        totalEvents: Math.min(eventsAtSameTime, 3),
        eventPosition: myPosition
      };
    });

    // Finally, convert everything to the format that react-big-calendar expects
    return eventsWithOverlap.map((event) => ({
      id: `${event.occurrence.series_id}-${event.occurrence.occurrence_start_utc}-${event.index}`,
      title: event.occurrence.title,
      start: event.start,  // Keep the same Date object - no changes
      end: event.end,      // Keep the same Date object - no changes
      allDay: false,
      occurrence: event.occurrence,
      resource: {
        eventType: event.occurrence.event_type || 'Event',
        isException: event.occurrence.is_exception,
        link: event.occurrence.link,
        notes: event.occurrence.notes,
        totalEvents: event.totalEvents,
        eventPosition: event.eventPosition
      }
    }));
  }, [occurrences, timezone]);

     // Handle keyboard navigation between events
    const handleEventKeyDown = useCallback((event: React.KeyboardEvent, eventIndex: number) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setSelectedEventIndex(prev => 
            prev < events.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          event.preventDefault();
          setSelectedEventIndex(prev => 
            prev > 0 ? prev - 1 : events.length - 1
          );
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (events[eventIndex]) {
            dispatch(openModal(events[eventIndex].occurrence));
          }
          break;
        case 'Escape':
          event.preventDefault();
          setSelectedEventIndex(-1);
          break;
      }
    }, [events, dispatch]);

     // Clear the selected event when the events list changes
     useEffect(() => {
       setSelectedEventIndex(-1);
     }, [events]);


     // When someone clicks on an empty time slot, let's create a new event
    const handleSelectSlot = useCallback((slotInfo: any) => {
      console.log('🎯 SLOT SELECTED - handleSelectSlot called!');
      console.log('🕐 Slot info:', slotInfo);
      console.log('📅 Start:', slotInfo.start);
      console.log('⏰ End:', slotInfo.end);
      
      // Store the selected time and duration for the create modal
      const selectedStartTime = moment(slotInfo.start).format('YYYY-MM-DDTHH:mm');
      const durationMs = moment(slotInfo.end).diff(moment(slotInfo.start));
      const durationMinutes = Math.round(durationMs / (1000 * 60));
      
      console.log('🎯 SELECTED TIME:', selectedStartTime);
      console.log('⏱️ SELECTED DURATION:', durationMinutes, 'minutes');
      console.log('📝 FORMATTED FOR DISPLAY:', moment(slotInfo.start).format('DD/MM/YYYY HH:mm'));
      
      // Open the modal with the time data directly through Redux
      console.log('🚀 Opening create modal with time data...');
      dispatch(openCreateModalWithParams({
        startTime: selectedStartTime,
        duration: durationMinutes
      }));
    }, [dispatch]);

     // When someone drags an event to a new time, let's update it
    const handleEventDrop = useCallback(async ({ event, start, end }: any) => {
      try {
        const calendarEvent = event as CalendarEvent;
        const occurrence = calendarEvent.occurrence;
        
        // Store original values for undo
        const originalStart = new Date(occurrence.occurrence_start_utc);
        const originalDuration = occurrence.duration_minutes;
        
        // Calculate new duration in minutes
        const newDurationMs = end.getTime() - start.getTime();
        const newDurationMinutes = Math.round(newDurationMs / (1000 * 60));
        
        // Ensure minimum duration of 15 minutes
        const finalDuration = Math.max(newDurationMinutes, 15);
        
        // Convert to UTC for API call
        const newStartUTC = moment(start).utc().toISOString();
        
        // Use the original occurrence time for exceptions
        const originalOccurrenceTime = occurrence.is_exception && occurrence.original_occurrence_start_utc 
          ? occurrence.original_occurrence_start_utc 
          : occurrence.occurrence_start_utc;
        
        const overrideData = {
          occurrence_start_utc: originalOccurrenceTime,
          override_start_utc: newStartUTC,
          override_duration_minutes: finalDuration,
          override_title: occurrence.title,
          override_link: occurrence.link || '',
          override_notes: occurrence.notes || '',
          override_location: occurrence.location || '',
          override_host: occurrence.host || '',
          override_event_type: occurrence.event_type
        };
        
        // Create occurrence override with new time/duration
        await createOccurrenceOverride(occurrence.series_id, overrideData);
        
        // Add undo action
        addAction({
          type: 'move',
          description: `Moved "${occurrence.title}"`,
          undo: async () => {
            const undoOverrideData = {
              occurrence_start_utc: originalOccurrenceTime,
              override_start_utc: originalStart.toISOString(),
              override_duration_minutes: originalDuration,
              override_title: occurrence.title,
              override_link: occurrence.link || '',
              override_notes: occurrence.notes || '',
              override_location: occurrence.location || '',
              override_host: occurrence.host || '',
              override_event_type: occurrence.event_type
            };
            await createOccurrenceOverride(occurrence.series_id, undoOverrideData);
            await dispatch(fetchOccurrences({
              startISO: weekInfo.weekStart,
              endISO: weekInfo.weekEnd,
              timezone: 'UTC'
            }));
          },
          redo: async () => {
            await createOccurrenceOverride(occurrence.series_id, overrideData);
            await dispatch(fetchOccurrences({
              startISO: weekInfo.weekStart,
              endISO: weekInfo.weekEnd,
              timezone: 'UTC'
            }));
          }
        });
        
        // Refresh the calendar
        await dispatch(fetchOccurrences({
          startISO: weekInfo.weekStart,
          endISO: weekInfo.weekEnd,
          timezone: 'UTC'
        }));
        
      } catch (error) {
        console.error('❌ Failed to move event:', error);
        alert('Failed to move event. Please try again.');
      }
    }, [dispatch, weekInfo, timezone, addAction]);

     // Let's see what happens when someone starts dragging an event
    const handleEventDragStart = useCallback(({ event }: any) => {
      console.log('🚀 DRAG STARTED - This should appear when you start dragging!');
      console.log('🚀 Drag started:', event);
      console.log('📅 Event start:', event.start);
      console.log('📅 Event end:', event.end);
      console.log('🎯 Event title:', event.title);
      console.log('🔍 Event occurrence:', event.occurrence);
    }, []);

     // Check if drag and drop is actually working
    const handleMouseDown = useCallback((event: any) => {
      console.log('🖱️ Mouse down on event:', event);
    }, []);

    // When someone clicks on an event, open the edit modal
    const handleSelectEvent = useCallback((event: any) => {
      console.log('Event selected:', event);
      if (event.occurrence) {
        dispatch(openModal(event.occurrence));
      }
    }, [dispatch]);


     // This is where we decide how each event should look (colors, positioning, etc.)
    const eventStyleGetter = useCallback((event: any) => {
      const eventType = event.resource?.eventType || 'Event';
      const totalEvents = event.resource?.totalEvents || 1;
      const myPosition = event.resource?.eventPosition || 0;
      
       // Pick colors based on what type of event this is
       const getEventColor = (type: string): string => {
         switch (type) {
           case 'Meeting': return '#3b82f6'; // Nice blue for meetings
           case '1st': return '#f59e0b'; // Orange for first meetings
           case 'Presentation': return '#8b5cf6'; // Purple for presentations
           case 'Event':
           default: return '#10b981'; // Green for regular events
         }
       };

     // Figure out how wide each event should be and where to put it
     const getEventDimensions = (total: number, position: number) => {
       if (total === 1) {
         return { width: '100%', left: '0%' };
       } else if (total === 2) {
         return {
           width: '49%',  // Make them a bit smaller so they don't touch
           left: position === 0 ? '0%' : '51%'  // Leave a small gap between them
         };
       } else if (total >= 3) {
         return {
           width: '32%',
           left: position === 0 ? '0%' : position === 1 ? '34%' : '68%'
         };
       }
       return { width: '100%', left: '0%' };
     };

    const { width, left } = getEventDimensions(totalEvents, myPosition);

    // Add a CSS class if this event overlaps with others
    const className = totalEvents > 1 ? `overlapping-event-${totalEvents}` : '';
    
     return {
       style: {
         backgroundColor: getEventColor(eventType),
         borderRadius: '4px',
         opacity: 0.9,
         color: 'white',
         border: 'none',
         display: 'block',
         zIndex: 1,
         width: `${width}`,
         left: `${left}`,
         // Let react-big-calendar handle the vertical positioning
       },
       className: className
     };
     }, []);


    // This is our custom event display component that shows more info than the default
    const EventComponent = ({ event }: { event: CalendarEvent }) => {
      const eventType = event.resource?.eventType || 'Event';
      const eventIndex = events.findIndex(e => e.id === event.id);
      const isSelected = selectedEventIndex === eventIndex;
      
      const handleEventClick = () => {
        dispatch(openModal(event.occurrence));
      };

      const handleKeyDown = (e: React.KeyboardEvent) => {
        handleEventKeyDown(e, eventIndex);
      };
      
      const getEventIcon = (type: string) => {
        switch (type) {
          case 'Meeting':
            return (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            );
          case '1st':
            return (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
                <path d="M4 22h16"/>
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21l-1.25.5c-.3.12-.78.12-1.08 0l-1.25-.5A1.25 1.25 0 0 1 5 17v-2.34"/>
                <path d="M14 14.66V17c0 .55.47.98.97 1.21l1.25.5c.3.12.78.12 1.08 0l1.25-.5c.5-.23.97-.66.97-1.21v-2.34"/>
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
              </svg>
            );
          case 'Presentation':
            return (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            );
          case 'Event':
          default:
            return (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            );
        }
      };


      return (
        <div 
          data-event-type={eventType}
          onClick={handleEventClick}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="button"
          aria-label={`${event.title} - ${eventType} event`}
          style={{ 
            height: '100%', 
            padding: '6px 8px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            minHeight: '90px',
            cursor: 'pointer',
            outline: isSelected ? '2px solid #3b82f6' : 'none',
            outlineOffset: '2px',
            backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
          }}>
          <div style={{ 
            fontWeight: 700, 
            fontSize: '0.8rem', 
            lineHeight: 1.3,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '2px'
          }}>
            {getEventIcon(eventType)}
            <span style={{ 
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
            }}>
              {event.title}
            </span>
          </div>
          
           {/* Show location and host info if we have it */}
          {(event.occurrence.location || event.occurrence.host) && (
            <div style={{
              fontSize: '0.7rem',
              opacity: 0.9,
              lineHeight: 1.2,
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
            }}>
              {eventType === 'Event' && event.occurrence.location && (
                <div style={{ marginBottom: '1px' }}>
                  📍 {event.occurrence.location}
                </div>
              )}
              {event.occurrence.host && (
                <div>
                  👤 {event.occurrence.host}
                </div>
              )}
            </div>
          )}
          
        </div>
      );
    };


    return (
      <div 
        style={{ 
          height: '600px',
          animation: 'fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        
        <DragAndDropCalendar
          localizer={localizer}
          events={events}
          startAccessor={"start" as any}
          endAccessor={"end" as any}
          style={{ height: '100%' } as React.CSSProperties}
          view="week"
          views={['week']}
          date={new Date(selectedWeek)}
          onSelectEvent={handleSelectEvent}
          onSelectSlot={handleSelectSlot}
        onEventDrop={handleEventDrop}
          onEventDragStart={handleEventDragStart}
           // Allow dragging events between days
           draggableAccessor={() => true}
           onView={() => {}} // Empty handler to prevent warning
           onNavigate={() => {}} // Empty handler to prevent warning
           selectable={true}
           resizable={false}
           eventPropGetter={eventStyleGetter}
           components={{
             event: EventComponent as any,
             toolbar: () => null, // Hide the default toolbar since we have our own
            header: ({ label }: { label: string }) => (
              <div style={{ 
                padding: '8px 12px', 
                fontWeight: '600', 
                fontSize: '0.875rem',
                color: '#374151',
                textAlign: 'center',
                borderBottom: '1px solid #e5e7eb'
              }}>
                {label}
              </div>
            ),
            timeSlotWrapper: ({ children }: { children: React.ReactNode }) => (
              <div style={{ height: '90px', minHeight: '90px' }}>
                {children}
              </div>
            )
          }}
          step={30}
          timeslots={1}
           // Allow events to span multiple days
           showMultiDayTimes={true}
           popup={true}
           popupOffset={{ x: 10, y: 10 }}
           // Let events flow naturally across days
          formats={{
            timeGutterFormat: 'HH:mm',
            eventTimeRangeFormat: ({ start, end }) => 
              `${moment(start).format('HH:mm')} - ${moment(end).format('HH:mm')}`,
            dayFormat: 'ddd D',
            dayHeaderFormat: 'ddd D'
          }}
          messages={{
            next: 'Next',
            previous: 'Previous',
            today: 'Today',
            month: 'Month',
            week: 'Week',
            day: 'Day',
            agenda: 'Agenda',
            date: 'Date',
            time: 'Time',
            event: 'Event',
            noEventsInRange: 'No events in this range',
            showMore: (total) => `+${total} more`
          }}
           // Make sure we can see all events properly
           doShowMoreDrillDown={true}
        />
      </div>
    );
  };

  export default BigCalendar;