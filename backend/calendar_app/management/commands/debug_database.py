"""
Debug command to check database state and see if seeding is happening automatically
"""

from django.core.management.base import BaseCommand
from calendar_app.models import EventSeries, EventException
from django.db import connection


class Command(BaseCommand):
    help = 'Debug database state and check for auto-seeding'

    def handle(self, *args, **options):
        self.stdout.write('=== DEBUG: Database State ===')
        
        # Check current database state
        series_count = EventSeries.objects.count()
        exception_count = EventException.objects.count()
        
        self.stdout.write(f'Current EventSeries count: {series_count}')
        self.stdout.write(f'Current EventException count: {exception_count}')
        
        if series_count > 0:
            self.stdout.write('\n=== EventSeries Details ===')
            for series in EventSeries.objects.all():
                self.stdout.write(
                    f'Series {series.id}: "{series.title}" '
                    f'(freq: {series.freq}, deleted: {series.is_deleted}, '
                    f'created: {series.created_at})'
                )
        
        if exception_count > 0:
            self.stdout.write('\n=== EventException Details ===')
            for exception in EventException.objects.all():
                self.stdout.write(
                    f'Exception {exception.id}: Series {exception.series_id} '
                    f'at {exception.occurrence_start_utc} '
                    f'(deleted: {exception.deleted})'
                )
        
        # Check if there are any database triggers or constraints
        self.stdout.write('\n=== Database Schema Info ===')
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT name, sql FROM sqlite_master 
                WHERE type='table' AND name IN ('calendar_app_eventseries', 'calendar_app_eventexception')
            """)
            tables = cursor.fetchall()
            for table_name, table_sql in tables:
                self.stdout.write(f'Table: {table_name}')
                self.stdout.write(f'SQL: {table_sql[:200]}...')
        
        self.stdout.write('\n=== End Debug ===')
