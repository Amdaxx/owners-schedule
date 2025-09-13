"""
Test cases for recurrence expansion service.
Tests various recurrence patterns and exception handling.
"""

from django.test import TestCase
from django.utils import timezone
from datetime import datetime, timedelta
from calendar_app.models import EventSeries, EventException
from calendar_app.services.expand import expand_series, expand_all_series, get_weekday_from_date


class RecurrenceExpansionTest(TestCase):
    """Test recurrence pattern expansion"""
    
    def setUp(self):
        # Use a specific Monday for predictable testing
        self.monday_9am = timezone.datetime(2025, 1, 20, 9, 0, 0, tzinfo=timezone.utc)
        self.window_start = self.monday_9am - timedelta(days=1)
        self.window_end = self.monday_9am + timedelta(days=21)  # 3 weeks
    
    def test_never_frequency(self):
        """Test single (NEVER) event expansion"""
        series = EventSeries.objects.create(
            title="One-off Event",
            start_utc=self.monday_9am,
            duration_minutes=60,
            freq='NEVER'
        )
        
        occurrences = expand_series(series, self.window_start, self.window_end)
        self.assertEqual(len(occurrences), 1)
        self.assertEqual(occurrences[0]['title'], "One-off Event")
        self.assertEqual(occurrences[0]['occurrence_start_utc'], self.monday_9am)
        self.assertEqual(occurrences[0]['duration_minutes'], 60)
        self.assertFalse(occurrences[0]['is_exception'])
    
    def test_daily_frequency(self):
        """Test daily recurrence expansion"""
        series = EventSeries.objects.create(
            title="Daily Event",
            start_utc=self.monday_9am,
            duration_minutes=30,
            freq='DAILY',
            interval=1
        )
        
        occurrences = expand_series(series, self.window_start, self.window_end)
        self.assertEqual(len(occurrences), 22)  # 21 days + start day
        
        # Check first few occurrences
        self.assertEqual(occurrences[0]['occurrence_start_utc'], self.monday_9am)
        self.assertEqual(occurrences[1]['occurrence_start_utc'], self.monday_9am + timedelta(days=1))
        self.assertEqual(occurrences[2]['occurrence_start_utc'], self.monday_9am + timedelta(days=2))
    
    def test_workday_frequency(self):
        """Test workday (Mon-Fri) recurrence expansion"""
        series = EventSeries.objects.create(
            title="Workday Event",
            start_utc=self.monday_9am,
            duration_minutes=15,
            freq='WORKDAY'
        )
        
        occurrences = expand_series(series, self.window_start, self.window_end)
        
        # Should have 3 weeks * 5 workdays = 15 occurrences
        self.assertEqual(len(occurrences), 15)
        
        # Check that all occurrences are on weekdays (Mon=0, Fri=4)
        for occ in occurrences:
            weekday = occ['occurrence_start_utc'].weekday()
            self.assertIn(weekday, [0, 1, 2, 3, 4])  # Mon-Fri
    
    def test_weekly_frequency(self):
        """Test weekly recurrence expansion"""
        series = EventSeries.objects.create(
            title="Weekly Event",
            start_utc=self.monday_9am,
            duration_minutes=45,
            freq='WEEKLY',
            byweekday=['MO'],
            interval=1
        )
        
        occurrences = expand_series(series, self.window_start, self.window_end)
        self.assertEqual(len(occurrences), 3)  # 3 Mondays in 3 weeks
        
        # Check that all are Mondays
        for occ in occurrences:
            self.assertEqual(occ['occurrence_start_utc'].weekday(), 0)  # Monday
    
    def test_weekly_multiple_days(self):
        """Test weekly recurrence on multiple days"""
        series = EventSeries.objects.create(
            title="Weekly Multi-day Event",
            start_utc=self.monday_9am,
            duration_minutes=30,
            freq='WEEKLY',
            byweekday=['MO', 'WE', 'FR'],
            interval=1
        )
        
        occurrences = expand_series(series, self.window_start, self.window_end)
        self.assertEqual(len(occurrences), 9)  # 3 weeks * 3 days
        
        # Check weekdays
        weekdays = [occ['occurrence_start_utc'].weekday() for occ in occurrences]
        expected_weekdays = [0, 2, 4] * 3  # Mon, Wed, Fri for 3 weeks
        self.assertEqual(sorted(weekdays), sorted(expected_weekdays))
    
    def test_fortnightly_frequency(self):
        """Test fortnightly (every 2 weeks) recurrence"""
        series = EventSeries.objects.create(
            title="Fortnightly Event",
            start_utc=self.monday_9am,
            duration_minutes=60,
            freq='FORTNIGHTLY',
            byweekday=['MO'],
            interval=2
        )
        
        occurrences = expand_series(series, self.window_start, self.window_end)
        self.assertEqual(len(occurrences), 2)  # Every 2 weeks in 3-week window
        
        # Check dates are 2 weeks apart
        self.assertEqual(occurrences[0]['occurrence_start_utc'], self.monday_9am)
        self.assertEqual(occurrences[1]['occurrence_start_utc'], self.monday_9am + timedelta(days=14))
    
    def test_weekly_inferred_weekday(self):
        """Test weekly recurrence with weekday inferred from start date"""
        # Start on Wednesday
        wednesday_start = self.monday_9am + timedelta(days=2)
        series = EventSeries.objects.create(
            title="Weekly Wednesday",
            start_utc=wednesday_start,
            duration_minutes=30,
            freq='WEEKLY',
            byweekday=[],  # Empty - should infer Wednesday
            interval=1
        )
        
        occurrences = expand_series(series, self.window_start, self.window_end)
        
        # All should be on Wednesday
        for occ in occurrences:
            self.assertEqual(occ['occurrence_start_utc'].weekday(), 2)  # Wednesday


class ExceptionHandlingTest(TestCase):
    """Test exception (override/delete) handling in expansion"""
    
    def setUp(self):
        self.monday_9am = timezone.datetime(2025, 1, 20, 9, 0, 0, tzinfo=timezone.utc)
        self.window_start = self.monday_9am - timedelta(days=1)
        self.window_end = self.monday_9am + timedelta(days=21)
        
        self.series = EventSeries.objects.create(
            title="Weekly Event",
            start_utc=self.monday_9am,
            duration_minutes=30,
            freq='WEEKLY',
            byweekday=['MO']
        )
    
    def test_deleted_occurrence(self):
        """Test that deleted occurrences are excluded"""
        # Delete the second occurrence
        second_monday = self.monday_9am + timedelta(days=7)
        EventException.objects.create(
            series=self.series,
            occurrence_start_utc=second_monday,
            deleted=True
        )
        
        occurrences = expand_series(self.series, self.window_start, self.window_end)
        
        # Should have 2 instead of 3 occurrences
        self.assertEqual(len(occurrences), 2)
        
        # Check that the deleted occurrence is not present
        occurrence_dates = [occ['occurrence_start_utc'] for occ in occurrences]
        self.assertNotIn(second_monday, occurrence_dates)
    
    def test_override_occurrence(self):
        """Test that occurrence overrides are applied"""
        # Override the second occurrence
        second_monday = self.monday_9am + timedelta(days=7)
        new_start = second_monday + timedelta(hours=1)
        
        EventException.objects.create(
            series=self.series,
            occurrence_start_utc=second_monday,
            override_start_utc=new_start,
            override_duration_minutes=45,
            override_title="Modified Weekly Event",
            override_notes="This is a modified occurrence"
        )
        
        occurrences = expand_series(self.series, self.window_start, self.window_end)
        self.assertEqual(len(occurrences), 3)
        
        # Find the modified occurrence
        modified_occ = next((occ for occ in occurrences if occ['is_exception']), None)
        self.assertIsNotNone(modified_occ)
        self.assertEqual(modified_occ['occurrence_start_utc'], new_start)
        self.assertEqual(modified_occ['duration_minutes'], 45)
        self.assertEqual(modified_occ['title'], "Modified Weekly Event")
        self.assertEqual(modified_occ['notes'], "This is a modified occurrence")
    
    def test_partial_override(self):
        """Test that partial overrides keep original values for non-overridden fields"""
        second_monday = self.monday_9am + timedelta(days=7)
        
        EventException.objects.create(
            series=self.series,
            occurrence_start_utc=second_monday,
            override_title="Just Title Changed"
            # Other fields not overridden
        )
        
        occurrences = expand_series(self.series, self.window_start, self.window_end)
        modified_occ = next((occ for occ in occurrences if occ['is_exception']), None)
        
        self.assertEqual(modified_occ['title'], "Just Title Changed")
        self.assertEqual(modified_occ['duration_minutes'], 30)  # Original value
        self.assertEqual(modified_occ['occurrence_start_utc'], second_monday)  # Original time


class DST_TimezoneTest(TestCase):
    """Test DST boundary handling for London timezone"""
    
    def test_dst_transition_spring(self):
        """Test DST transition in spring (last Sunday of March 2025)"""
        # March 30, 2025 is the last Sunday of March (DST starts)
        # At 1:00 AM GMT, clocks spring forward to 2:00 AM BST
        
        # Create a daily event that spans the DST transition
        pre_dst = timezone.datetime(2025, 3, 29, 10, 0, 0, tzinfo=timezone.utc)  # Saturday
        post_dst_window = timezone.datetime(2025, 3, 31, 23, 59, 59, tzinfo=timezone.utc)  # Monday end
        
        series = EventSeries.objects.create(
            title="Daily DST Test",
            start_utc=pre_dst,
            duration_minutes=60,
            freq='DAILY'
        )
        
        occurrences = expand_series(series, pre_dst, post_dst_window)
        
        # Should have 3 occurrences: Sat, Sun, Mon
        self.assertEqual(len(occurrences), 3)
        
        # All should maintain the same UTC time regardless of DST
        for i, occ in enumerate(occurrences):
            expected_utc = pre_dst + timedelta(days=i)
            self.assertEqual(occ['occurrence_start_utc'], expected_utc)
    
    def test_dst_transition_autumn(self):
        """Test DST transition in autumn (last Sunday of October 2025)"""
        # October 26, 2025 is the last Sunday of October (DST ends)
        # At 2:00 AM BST, clocks fall back to 1:00 AM GMT
        
        pre_dst_end = timezone.datetime(2025, 10, 25, 10, 0, 0, tzinfo=timezone.utc)  # Saturday
        post_dst_end_window = timezone.datetime(2025, 10, 27, 23, 59, 59, tzinfo=timezone.utc)  # Monday end
        
        series = EventSeries.objects.create(
            title="Daily DST End Test",
            start_utc=pre_dst_end,
            duration_minutes=30,
            freq='DAILY'
        )
        
        occurrences = expand_series(series, pre_dst_end, post_dst_end_window)
        
        # Should have 3 occurrences: Sat, Sun, Mon
        self.assertEqual(len(occurrences), 3)
        
        # All should maintain the same UTC time regardless of DST
        for i, occ in enumerate(occurrences):
            expected_utc = pre_dst_end + timedelta(days=i)
            self.assertEqual(occ['occurrence_start_utc'], expected_utc)


class ExpandAllSeriesTest(TestCase):
    """Test expansion of multiple series together"""
    
    def setUp(self):
        self.monday_9am = timezone.datetime(2025, 1, 20, 9, 0, 0, tzinfo=timezone.utc)
        self.window_start = self.monday_9am
        self.window_end = self.monday_9am + timedelta(days=7)
    
    def test_multiple_series_expansion(self):
        """Test expanding multiple series in one call"""
        # Create multiple series
        EventSeries.objects.create(
            title="Daily Meeting",
            start_utc=self.monday_9am,
            duration_minutes=15,
            freq='DAILY'
        )
        
        EventSeries.objects.create(
            title="Weekly Review",
            start_utc=self.monday_9am + timedelta(hours=2),
            duration_minutes=60,
            freq='WEEKLY',
            byweekday=['MO']
        )
        
        EventSeries.objects.create(
            title="One-off Event",
            start_utc=self.monday_9am + timedelta(days=3),
            duration_minutes=30,
            freq='NEVER'
        )
        
        all_occurrences = expand_all_series(self.window_start, self.window_end)
        
        # Should have: 7 daily + 1 weekly + 1 one-off = 9 total
        self.assertEqual(len(all_occurrences), 9)
        
        # Check that results are sorted by start time
        start_times = [occ['occurrence_start_utc'] for occ in all_occurrences]
        self.assertEqual(start_times, sorted(start_times))
    
    def test_deleted_series_excluded(self):
        """Test that deleted series are excluded from expansion"""
        EventSeries.objects.create(
            title="Active Series",
            start_utc=self.monday_9am,
            duration_minutes=30,
            freq='DAILY'
        )
        
        EventSeries.objects.create(
            title="Deleted Series",
            start_utc=self.monday_9am,
            duration_minutes=30,
            freq='DAILY',
            is_deleted=True
        )
        
        all_occurrences = expand_all_series(self.window_start, self.window_end)
        
        # Should only have occurrences from active series
        self.assertEqual(len(all_occurrences), 7)  # 7 days
        for occ in all_occurrences:
            self.assertEqual(occ['title'], "Active Series")


class UtilityFunctionTest(TestCase):
    """Test utility functions"""
    
    def test_get_weekday_from_date(self):
        """Test weekday extraction from datetime"""
        monday = timezone.datetime(2025, 1, 20, 9, 0, 0, tzinfo=timezone.utc)  # Monday
        tuesday = monday + timedelta(days=1)
        sunday = monday + timedelta(days=6)
        
        self.assertEqual(get_weekday_from_date(monday), 'MO')
        self.assertEqual(get_weekday_from_date(tuesday), 'TU')
        self.assertEqual(get_weekday_from_date(sunday), 'SU')
