"""
Views for the calendar API.
Provides CRUD operations for event series and occurrence-level operations.
"""

from datetime import datetime
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.request import Request
from pytz import timezone as pytz_timezone
from .models import EventSeries, EventException
from .serializers import EventSeriesSerializer, EventExceptionSerializer
from .services.expand import expand_all_series, expand_series


class EventSeriesViewSet(viewsets.ModelViewSet):
    """
    ViewSet for CRUD operations on EventSeries.
    Provides additional actions for occurrence-level operations.
    """
    queryset = EventSeries.objects.filter(is_deleted=False)
    serializer_class = EventSeriesSerializer
    
    @action(detail=True, methods=['post', 'delete'], url_path='occurrence')
    def occurrence(self, request: Request, pk=None):
        """
        Handle occurrence-level operations (create/update overrides or delete occurrences).
        
        POST - Create or update a per-occurrence override:
        {
            "occurrence_start_utc": "2025-01-20T09:00:00Z",
            "override_start_utc": "2025-01-20T10:00:00Z",  // optional
            "override_duration_minutes": 45,  // optional
            "override_title": "Modified Title",  // optional
            "override_link": "https://example.com",  // optional
            "override_notes": "Modified notes"  // optional
        }
        
        DELETE - Mark a specific occurrence as deleted:
        Query parameter: occurrence_start_utc (ISO datetime string)
        """
        series = self.get_object()
        
        if request.method == 'DELETE':
            return self._handle_delete_occurrence(request, series)
        else:  # POST
            return self._handle_create_occurrence(request, series)
    
    def _handle_create_occurrence(self, request: Request, series):
        
        occurrence_start_str = request.data.get('occurrence_start_utc')
        if not occurrence_start_str:
            return Response(
                {'error': 'occurrence_start_utc is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Parse the occurrence start time
        occurrence_start_utc = parse_datetime(occurrence_start_str)
        if not occurrence_start_utc:
            return Response(
                {'error': 'occurrence_start_utc must be a valid ISO datetime'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Ensure it's timezone-aware
        if timezone.is_naive(occurrence_start_utc):
            occurrence_start_utc = timezone.make_aware(occurrence_start_utc, timezone.utc)
        
        # Get or create the exception
        exception, created = EventException.objects.get_or_create(
            series=series,
            occurrence_start_utc=occurrence_start_utc,
            defaults={'deleted': False}
        )
        
        # Update override fields
        override_fields = [
            'override_start_utc', 'override_duration_minutes', 
            'override_title', 'override_link', 'override_notes', 'override_location', 'override_host', 'override_event_type'
        ]
        
        for field in override_fields:
            if field in request.data:
                value = request.data[field]
                
                if field == 'override_start_utc' and value:
                    # Parse datetime field
                    parsed_dt = parse_datetime(value)
                    if parsed_dt:
                        if timezone.is_naive(parsed_dt):
                            parsed_dt = timezone.make_aware(parsed_dt, timezone.utc)
                        value = parsed_dt
                    else:
                        return Response(
                            {'error': f'{field} must be a valid ISO datetime'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                setattr(exception, field, value)
        
        exception.deleted = False  # Ensure it's not marked as deleted
        exception.save()
        
        # Check what was actually saved
        exception.refresh_from_db()
        
        serializer = EventExceptionSerializer(exception)
        return Response(serializer.data, status=status.HTTP_200_OK if not created else status.HTTP_201_CREATED)
    
    def _handle_delete_occurrence(self, request: Request, series):
        """
        Mark a specific occurrence as deleted.
        
        Query parameter:
        - occurrence_start_utc: ISO datetime string
        """
        
        occurrence_start_str = request.query_params.get('occurrence_start_utc')
        if not occurrence_start_str:
            return Response(
                {'error': 'occurrence_start_utc query parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Parse the occurrence start time
        occurrence_start_utc = parse_datetime(occurrence_start_str)
        if not occurrence_start_utc:
            return Response(
                {'error': 'occurrence_start_utc must be a valid ISO datetime'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Ensure it's timezone-aware
        if timezone.is_naive(occurrence_start_utc):
            occurrence_start_utc = timezone.make_aware(occurrence_start_utc, timezone.utc)
        
        # First, try to find an existing exception at the current time (for dragged events)
        exception = EventException.objects.filter(
            series=series,
            occurrence_start_utc=occurrence_start_utc
        ).first()
        
        if exception:
            # Found an exception - mark it as deleted
            exception.deleted = True
            exception.save()
        else:
            # No exception found at current time - this might be a dragged event
            # Look for exceptions that override this time
            override_exception = EventException.objects.filter(
                series=series,
                override_start_utc=occurrence_start_utc
            ).first()
            
            if override_exception:
                # Found an override exception - mark it as deleted
                override_exception.deleted = True
                override_exception.save()
            else:
                # Create a new deletion exception at the current time
                exception = EventException.objects.create(
                    series=series,
                    occurrence_start_utc=occurrence_start_utc,
                    deleted=True
                )
        
        return Response({'message': 'Occurrence deleted successfully'}, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'])
    def split(self, request: Request, pk=None):
        """
        Split a series at a specific occurrence ("Edit all future" operation).
        
        Expected payload:
        {
            "occurrence_start_utc": "2025-01-20T09:00:00Z",
            "updates": {  // optional updates to apply to the new series
                "title": "New Title",
                "duration_minutes": 45,
                // ... other EventSeries fields
            }
        }
        
        Returns both the original (truncated) and new series.
        """
        original_series = self.get_object()
        
        occurrence_start_str = request.data.get('occurrence_start_utc')
        if not occurrence_start_str:
            return Response(
                {'error': 'occurrence_start_utc is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Parse the split point
        split_start_utc = parse_datetime(occurrence_start_str)
        if not split_start_utc:
            return Response(
                {'error': 'occurrence_start_utc must be a valid ISO datetime'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Ensure it's timezone-aware
        if timezone.is_naive(split_start_utc):
            split_start_utc = timezone.make_aware(split_start_utc, timezone.utc)
        
        # Truncate the original series
        original_series.until_utc = split_start_utc - timezone.timedelta(seconds=1)
        original_series.save()
        
        # Create the new series starting from the split point
        new_series_data = {
            'title': original_series.title,
            'start_utc': split_start_utc,
            'duration_minutes': original_series.duration_minutes,
            'freq': original_series.freq,
            'byweekday': original_series.byweekday.copy(),
            'interval': original_series.interval,
            'until_utc': original_series.until_utc,  # Keep original end date
            'link': original_series.link,
            'notes': original_series.notes,
            'is_deleted': False,
        }
        
        # Apply any updates from the request
        updates = request.data.get('updates', {})
        for field, value in updates.items():
            if field in new_series_data and field != 'id':  # Don't allow ID updates
                new_series_data[field] = value
        
        # Create the new series
        new_series = EventSeries.objects.create(**new_series_data)
        
        # Copy relevant exceptions (those that occur after the split)
        for exception in original_series.exceptions.all():
            if exception.occurrence_start_utc >= split_start_utc:
                # Move this exception to the new series
                exception.series = new_series
                exception.save()
        
        # Serialize both series
        original_serializer = EventSeriesSerializer(original_series)
        new_serializer = EventSeriesSerializer(new_series)
        
        return Response({
            'original_series': original_serializer.data,
            'new_series': new_serializer.data
        }, status=status.HTTP_201_CREATED)


def occurrences_view(request):
    """
    Get expanded occurrences within a time window.
    
    Query parameters:
    - start: ISO datetime string (required)
    - end: ISO datetime string (required)  
    - tz: Timezone name (optional, e.g., 'Europe/London')
    
    Returns occurrences with UTC times, and optionally local times if tz is provided.
    """
    start_str = request.GET.get('start')
    end_str = request.GET.get('end')
    tz_name = request.GET.get('tz')
    
    if not start_str or not end_str:
        return JsonResponse(
            {'error': 'Both start and end query parameters are required'},
            status=400
        )
    
    # Parse datetime strings
    try:
        start_utc = parse_datetime(start_str)
        end_utc = parse_datetime(end_str)
        
        if not start_utc or not end_utc:
            raise ValueError("Invalid datetime format")
        
        # Ensure timezone-aware
        if timezone.is_naive(start_utc):
            start_utc = timezone.make_aware(start_utc, timezone.utc)
        if timezone.is_naive(end_utc):
            end_utc = timezone.make_aware(end_utc, timezone.utc)
            
    except (ValueError, TypeError):
        return JsonResponse(
            {'error': 'start and end must be valid ISO datetime strings'},
            status=400
        )
    
    # Validate timezone if provided
    local_tz = None
    if tz_name:
        try:
            local_tz = pytz_timezone(tz_name)
        except:
            return JsonResponse(
                {'error': f'Invalid timezone: {tz_name}'},
                status=400
            )
    
    # Expand occurrences
    occurrences = expand_all_series(start_utc, end_utc)
    
    # Add local time if timezone provided
    if local_tz:
        for occ in occurrences:
            utc_dt = occ['occurrence_start_utc']
            local_dt = utc_dt.astimezone(local_tz)
            occ['localStart'] = local_dt.isoformat()
            
    
    # Convert datetime objects to ISO strings for JSON serialization
    for occ in occurrences:
        occ['occurrence_start_utc'] = occ['occurrence_start_utc'].isoformat()
    
    
    return JsonResponse({'occurrences': occurrences})
