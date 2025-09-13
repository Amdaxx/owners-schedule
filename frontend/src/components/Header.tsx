/**
 * Compact control bar with week navigation, settings, and create event
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setSelectedWeek, setTimezone, selectSelectedWeek, selectTimezone, selectOccurrencesForWeek } from '../features/calendar/slice';
import { openCreateModalWithParams } from '../features/ui/slice';
import { navigateWeek, getCurrentWeekStart, getWeekRangeString, getTimezoneOptions, getWeekInfo } from '../lib/time';
import { createCacheKey } from '../api/client';
import { Occurrence } from '../types';

const Header: React.FC = () => {
  const dispatch = useDispatch();
  const selectedWeek = useSelector(selectSelectedWeek);
  const timezone = useSelector(selectTimezone);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  
  const timezoneOptions = getTimezoneOptions();
  

  // Close settings dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
    };

    if (showSettings) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettings]);

  const handlePreviousWeek = () => {
    const prevWeek = navigateWeek(selectedWeek, 'prev', timezone);
    dispatch(setSelectedWeek(prevWeek));
  };

  const handleNextWeek = () => {
    const nextWeek = navigateWeek(selectedWeek, 'next', timezone);
    dispatch(setSelectedWeek(nextWeek));
  };

  const handleToday = () => {
    const currentWeek = getCurrentWeekStart(timezone);
    dispatch(setSelectedWeek(currentWeek));
  };

  const handleTimezoneChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newTimezone = event.target.value;
    dispatch(setTimezone(newTimezone));
    
    // Keep the same calendar week, just change timezone
    // Don't change selectedWeek - it should stay the same
  };

  const handleCreateEvent = () => {
    dispatch(openCreateModalWithParams());
  };

  const showKeyboardShortcuts = () => {
    const shortcuts = [
      { key: 'Ctrl + ←', description: 'Previous week' },
      { key: 'Ctrl + →', description: 'Next week' },
      { key: 'Ctrl + E', description: 'Create new event' },
    ];

    const helpText = shortcuts
      .map(shortcut => `${shortcut.key}: ${shortcut.description}`)
      .join('\n');

    alert(`Keyboard Shortcuts:\n\n${helpText}`);
  };

  const weekRangeString = getWeekRangeString(selectedWeek, timezone);

  // Get weekly stats
  const weekInfo = getWeekInfo(selectedWeek, timezone);
  const cacheKey = createCacheKey(weekInfo.weekStart, weekInfo.weekEnd, timezone);
  const occurrences = useSelector((state: any) => selectOccurrencesForWeek(state, cacheKey));

  const eventStats = useMemo(() => {
    const stats = [
      { type: 'Meeting' as const, count: 0, emoji: '🤝', color: '#3b82f6' },
      { type: '1st' as const, count: 0, emoji: '🥇', color: '#f59e0b' },
      { type: 'Presentation' as const, count: 0, emoji: '📊', color: '#10b981' },
      { type: 'Event' as const, count: 0, emoji: '📅', color: '#8b5cf6' },
    ];

    occurrences.forEach((occ: Occurrence) => {
      const eventType = occ.event_type || 'Event';
      const stat = stats.find(s => s.type === eventType);
      if (stat) {
        stat.count++;
      }
    });

    return stats.filter(stat => stat.count > 0); // Only show types with events
  }, [occurrences]);

  return (
    <div className="control-bar">
      <div className="control-bar-content">
        {/* Left: Settings */}
        <div className="left-section">
          <div className="settings-area" ref={settingsRef}>
            
            <button 
              className="help-button"
              onClick={showKeyboardShortcuts}
              title="Keyboard Shortcuts (?)"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </button>
            
            <button 
              onClick={() => setShowSettings(!showSettings)} 
              className="settings-button"
              title="Settings"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
            
            {showSettings && (
              <div className="settings-dropdown">
                <div className="settings-item">
                  <label>Timezone:</label>
                  <select 
                    value={timezone} 
                    onChange={handleTimezoneChange}
                    className="timezone-select"
                  >
                    {timezoneOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Event Overview - Left side, bigger */}
          {eventStats.length > 0 && (
            <div className="event-overview">
              <span className="overview-label">This Week:</span>
              <div className="overview-stats">
                {eventStats.map((stat) => (
                  <div key={stat.type} className="overview-stat-item">
                    <span className="stat-emoji">{stat.emoji}</span>
                    <span className="stat-count" style={{ color: stat.color }}>
                      {stat.count}
                    </span>
                    <span className="stat-type">{stat.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Center: Week Navigation */}
        <div className="center-section">
          <div className="week-navigation">
            <button onClick={handlePreviousWeek} className="nav-button" title="Previous week">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15,18 9,12 15,6"/>
              </svg>
            </button>
            <div className="week-info">
              <span className="week-range">{weekRangeString}</span>
            </div>
            <button onClick={handleNextWeek} className="nav-button" title="Next week">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9,18 15,12 9,6"/>
              </svg>
            </button>
            <button onClick={handleToday} className="today-button" title="Go to current week">
              Today
            </button>
          </div>
        </div>

        {/* Right: Create Button */}
        <div className="right-section">
          <button onClick={handleCreateEvent} className="create-button" title="Create new event">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.5rem' }}>
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Create Event
          </button>
        </div>
      </div>
    </div>
  );
};

export default Header;
