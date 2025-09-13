"""
Management command to clear all calendar data (series and exceptions)
"""

from django.core.management.base import BaseCommand
from calendar_app.models import EventSeries, EventException


class Command(BaseCommand):
    help = 'Clear all calendar data (series and exceptions)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm',
            action='store_true',
            help='Confirm that you want to delete all data',
        )

    def handle(self, *args, **options):
        if not options['confirm']:
            self.stdout.write(
                self.style.WARNING(
                    'This will delete ALL calendar data. Use --confirm to proceed.'
                )
            )
            return

        # Delete all exceptions first (due to foreign key constraints)
        exception_count = EventException.objects.count()
        EventException.objects.all().delete()
        
        # Delete all series
        series_count = EventSeries.objects.count()
        EventSeries.objects.all().delete()
        
        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully cleared {series_count} event series and {exception_count} exceptions'
            )
        )

