"""
Service for expanding recurring event series into individual occurrences.
Handles recurrence patterns and applies per-occurrence exceptions.
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any
from dateutil import rrule
from dateutil.rrule import MO, TU, WE, TH, FR, SA, SU
from django.utils import timezone
from ..models import EventSeries


# Mapping weekday strings to dateutil constants
WEEKDAY_MAP = {
    'MO': MO, 'TU': TU, 'WE': WE, 'TH': TH, 'FR': FR, 'SA': SA, 'SU': SU
}

# Reverse mapping for getting weekday string from datetime
WEEKDAY_REVERSE = {
    0: 'MO', 1: 'TU', 2: 'WE', 3: 'TH', 4: 'FR', 5: 'SA', 6: 'SU'
}


def get_weekday_from_date(dt: datetime) -> str:
    """Get weekday string (e.g., 'MO') from a datetime object"""
    return WEEKDAY_REVERSE[dt.weekday()]


def create_rrule_for_series(series: EventSeries, until_dt: datetime = None) -> rrule.rrule:
    """
    Create a dateutil rrule object for the given series.
    
    Args:
        series: EventSeries instance
        until_dt: Optional end date to limit the rule
    
    Returns:
        rrule.rrule object for generating occurrences
    """
    start_dt = series.start_utc
    freq_map = {
        'NEVER': None,  # Handle separately
        'DAILY': rrule.DAILY,
        'WORKDAY': rrule.WEEKLY,  # Special case with Mon-Fri
        'WEEKLY': rrule.WEEKLY,
        'FORTNIGHTLY': rrule.WEEKLY,  # With interval=2
    }
    
    if series.freq == 'NEVER':
        return None
    
    # Determine until date
    rule_until = until_dt
    if series.until_utc:
        rule_until = series.until_utc if not until_dt else min(series.until_utc, until_dt)
    
    # Base rule parameters
    rule_params = {
        'freq': freq_map[series.freq],
        'dtstart': start_dt,
        'interval': series.interval,
    }
    
    if rule_until:
        rule_params['until'] = rule_until
    
    # Handle weekday restrictions
    if series.freq == 'WORKDAY':
        # Always Mon-Fri for workdays, ignore byweekday
        rule_params['byweekday'] = [MO, TU, WE, TH, FR]
        rule_params['interval'] = 1  # Workdays are always interval 1
    elif series.freq in ['WEEKLY', 'FORTNIGHTLY']:
        # Use provided byweekday or infer from start date
        if series.byweekday:
            weekdays = [WEEKDAY_MAP[wd] for wd in series.byweekday if wd in WEEKDAY_MAP]
            if weekdays:
                rule_params['byweekday'] = weekdays
        else:
            # Infer from start date weekday
            start_weekday = get_weekday_from_date(start_dt)
            rule_params['byweekday'] = [WEEKDAY_MAP[start_weekday]]
    
    return rrule.rrule(**rule_params)


def expand_series(series: EventSeries, window_start_utc: datetime, window_end_utc: datetime) -> List[Dict[str, Any]]:
    """
    Expand a series into individual occurrences within the given time window.
    Applies exceptions (deletions and overrides).
    
    Args:
        series: EventSeries to expand
        window_start_utc: Start of time window (inclusive)
        window_end_utc: End of time window (inclusive)
    
    Returns:
        List of occurrence dictionaries with fields:
        - series_id: ID of the parent series
        - occurrence_start_utc: Start time of this occurrence
        - duration_minutes: Duration in minutes
        - title: Event title
        - link: Event link
        - notes: Event notes
        - is_exception: Boolean indicating if this is an exception override
    """
    if series.is_deleted:
        return []
    
    occurrences = []
    
    # Handle single events (NEVER frequency)
    if series.freq == 'NEVER':
        if window_start_utc <= series.start_utc <= window_end_utc:
            occurrences.append({
                'series_id': series.id,
                'occurrence_start_utc': series.start_utc,
                'duration_minutes': series.duration_minutes,
                        'title': series.title,
                        'link': series.link,
                        'notes': series.notes,
                        'location': series.location,
                        'host': series.host,
                        'event_type': series.event_type,
                        'frequency': series.freq,
                        'is_exception': False,
            })
    else:
        # Handle recurring events
        rule = create_rrule_for_series(series, window_end_utc)
        if rule:
            # Generate base occurrences
            for occurrence_dt in rule:
                if occurrence_dt > window_end_utc:
                    break
                if occurrence_dt >= window_start_utc:
                    occurrences.append({
                        'series_id': series.id,
                        'occurrence_start_utc': occurrence_dt,
                        'duration_minutes': series.duration_minutes,
                        'title': series.title,
                        'link': series.link,
                        'notes': series.notes,
                        'location': series.location,
                        'host': series.host,
                        'event_type': series.event_type,
                        'frequency': series.freq,
                        'is_exception': False,
                    })
    
    # Apply exceptions - handle multiple exceptions per occurrence time
    exceptions_dict = {}
    for exception in series.exceptions.all():
        # Convert to ISO string for consistent comparison
        exc_time_str = exception.occurrence_start_utc.isoformat()
        if exc_time_str not in exceptions_dict:
            exceptions_dict[exc_time_str] = []
        exceptions_dict[exc_time_str].append(exception)
    
    # Filter and modify occurrences based on exceptions
    final_occurrences = []
    for occ in occurrences:
        occ_start = occ['occurrence_start_utc']
        
        # Convert occurrence time to ISO string for comparison
        if isinstance(occ_start, datetime):
            occ_start_str = occ_start.isoformat()
        else:
            occ_start_str = occ_start.isoformat() if hasattr(occ_start, 'isoformat') else str(occ_start)
        
        # Get all exceptions for this occurrence time
        exceptions_for_this_time = exceptions_dict.get(occ_start_str, [])
        
        if exceptions_for_this_time:
            # Check if any exception deletes this occurrence
            is_deleted = any(exc.deleted for exc in exceptions_for_this_time)
            if is_deleted:
                # Skip deleted occurrences
                continue
            
            # Apply overrides from the last non-deleted exception (most recent)
            non_deleted_exceptions = [exc for exc in exceptions_for_this_time if not exc.deleted]
            if non_deleted_exceptions:
                # Use the last exception (most recent)
                exception = non_deleted_exceptions[-1]
                
                modified_occ = occ.copy()
                modified_occ['is_exception'] = True
                modified_occ['original_occurrence_start_utc'] = occ_start  # Keep original time
                # Frequency is already copied from the original occurrence
                
                if exception.override_start_utc is not None:
                    modified_occ['occurrence_start_utc'] = exception.override_start_utc
                if exception.override_duration_minutes is not None:
                    modified_occ['duration_minutes'] = exception.override_duration_minutes
                if exception.override_title:
                    modified_occ['title'] = exception.override_title
                if exception.override_link:
                    modified_occ['link'] = exception.override_link
                if exception.override_notes:
                    modified_occ['notes'] = exception.override_notes
                if exception.override_location:
                    modified_occ['location'] = exception.override_location
                if exception.override_host:
                    modified_occ['host'] = exception.override_host
                if exception.override_event_type:
                    modified_occ['event_type'] = exception.override_event_type
                
                final_occurrences.append(modified_occ)
            else:
                # All exceptions are deletions, skip this occurrence
                continue
        else:
            final_occurrences.append(occ)
    
    return final_occurrences


def expand_all_series(window_start_utc: datetime, window_end_utc: datetime) -> List[Dict[str, Any]]:
    """
    Expand all non-deleted series within the given time window.
    
    Args:
        window_start_utc: Start of time window (inclusive)
        window_end_utc: End of time window (inclusive)
    
    Returns:
        List of all occurrence dictionaries from all series
    """
    all_occurrences = []
    
    # Get all non-deleted series
    series_queryset = EventSeries.objects.filter(is_deleted=False).prefetch_related('exceptions')
    
    for series in series_queryset:
        series_occurrences = expand_series(series, window_start_utc, window_end_utc)
        all_occurrences.extend(series_occurrences)
    
    # Sort by occurrence start time
    all_occurrences.sort(key=lambda x: x['occurrence_start_utc'])
    
    return all_occurrences
