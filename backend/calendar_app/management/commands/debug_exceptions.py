"""
Debug command to check exceptions in the database
"""

from django.core.management.base import BaseCommand
from calendar_app.models import EventSeries, EventException


class Command(BaseCommand):
    help = 'Debug exceptions in the database'

    def handle(self, *args, **options):
        self.stdout.write('=== DEBUG: EventExceptions in Database ===')
        
        # Get all exceptions
        exceptions = EventException.objects.all().order_by('series_id', 'occurrence_start_utc')
        
        if not exceptions:
            self.stdout.write('No exceptions found in database.')
            return
        
        for exception in exceptions:
            self.stdout.write(
                f'Series {exception.series_id}: {exception.occurrence_start_utc} '
                f'(deleted: {exception.deleted}, '
                f'override_start: {exception.override_start_utc})'
            )
        
        self.stdout.write(f'\nTotal exceptions: {exceptions.count()}')
        
        # Check series
        self.stdout.write('\n=== DEBUG: EventSeries in Database ===')
        series_list = EventSeries.objects.filter(is_deleted=False)
        
        for series in series_list:
            exception_count = series.exceptions.count()
            deleted_count = series.exceptions.filter(deleted=True).count()
            self.stdout.write(
                f'Series {series.id}: "{series.title}" '
                f'(exceptions: {exception_count}, deleted: {deleted_count})'
            )









