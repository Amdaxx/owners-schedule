"""
Management command to seed the calendar with sample data.
Creates various types of recurring events and exceptions for testing.
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import datetime, timedelta
from calendar_app.models import EventSeries, EventException


class Command(BaseCommand):
    help = 'Seed the calendar with sample events and exceptions'

    def handle(self, *args, **options):
        # Check if data already exists
        if EventSeries.objects.exists():
            self.stdout.write(
                self.style.WARNING(
                    f'Calendar already has {EventSeries.objects.count()} series. '
                    'Skipping seed to avoid duplicates. Use clear_calendar command first if needed.'
                )
            )
            return
            
        self.stdout.write('Seeding calendar data...')
        
        # Clear existing data (shouldn't be any, but just in case)
        EventException.objects.all().delete()
        EventSeries.objects.all().delete()
        
        # Get current time and create base dates
        now = timezone.now()
        today_9am = now.replace(hour=9, minute=0, second=0, microsecond=0)
        today_830am = now.replace(hour=8, minute=30, second=0, microsecond=0)
        
        # Find next Monday for weekly events
        days_until_monday = (7 - today_9am.weekday()) % 7
        if days_until_monday == 0 and today_9am.hour >= 9:
            days_until_monday = 7  # If it's Monday after 9am, use next Monday
        next_monday_9am = today_9am + timedelta(days=days_until_monday)
        
        # 1. Weekly Monday 09:00 UTC "Team Sync" (30 minutes)
        team_sync = EventSeries.objects.create(
            title="Team Sync",
            start_utc=next_monday_9am,
            duration_minutes=30,
            freq='WEEKLY',
            byweekday=['MO'],
            interval=1,
            link="https://meet.google.com/team-sync",
            notes="Weekly team synchronization meeting",
            event_type="Meeting"
        )
        self.stdout.write(f'Created weekly Team Sync starting {next_monday_9am}')
        
        # 2. Workday 08:30 UTC "Standup" (15 minutes)
        standup = EventSeries.objects.create(
            title="Daily Standup",
            start_utc=today_830am,
            duration_minutes=15,
            freq='WORKDAY',
            interval=1,
            link="https://meet.google.com/standup",
            notes="Daily team standup meeting",
            event_type="1st"
        )
        self.stdout.write(f'Created workday Standup starting {today_830am}')
        
        # 3. One-off event today
        one_off = EventSeries.objects.create(
            title="Project Kickoff Meeting",
            start_utc=now + timedelta(hours=2),
            duration_minutes=60,
            freq='NEVER',
            link="https://meet.google.com/kickoff",
            notes="Initial project planning and kickoff session",
            event_type="Presentation"
        )
        self.stdout.write(f'Created one-off Project Kickoff at {one_off.start_utc}')
        
        # 4. Exception: Move a Monday Team Sync by +60 minutes
        # Find the second occurrence of Team Sync (next week's Monday)
        second_monday = next_monday_9am + timedelta(days=7)
        team_sync_exception = EventException.objects.create(
            series=team_sync,
            occurrence_start_utc=second_monday,
            override_start_utc=second_monday + timedelta(hours=1),
            override_title="Team Sync (Delayed)",
            override_notes="Moved 1 hour later due to conflicting meeting"
        )
        self.stdout.write(f'Created Team Sync exception: moved {second_monday} to {team_sync_exception.override_start_utc}')
        
        # 5. Exception: Delete a Friday Standup
        # Find next Friday for standup deletion
        days_until_friday = (4 - now.weekday()) % 7  # Friday is weekday 4
        if days_until_friday == 0 and now.hour >= 8:
            days_until_friday = 7  # If it's Friday after 8am, use next Friday
        next_friday = today_830am + timedelta(days=days_until_friday)
        
        standup_deletion = EventException.objects.create(
            series=standup,
            occurrence_start_utc=next_friday,
            deleted=True
        )
        self.stdout.write(f'Created Standup deletion exception for {next_friday}')
        
        # 6. Fortnightly meeting for variety
        fortnightly_start = next_monday_9am.replace(hour=14, minute=0)  # 2 PM
        fortnightly = EventSeries.objects.create(
            title="Bi-weekly Review",
            start_utc=fortnightly_start,
            duration_minutes=45,
            freq='FORTNIGHTLY',
            byweekday=['MO'],
            interval=2,
            link="https://meet.google.com/review",
            notes="Fortnightly project review and planning",
            event_type="Event"
        )
        self.stdout.write(f'Created fortnightly Review starting {fortnightly_start}')
        
        # Summary
        series_count = EventSeries.objects.count()
        exception_count = EventException.objects.count()
        
        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully seeded calendar with {series_count} event series and {exception_count} exceptions'
            )
        )
