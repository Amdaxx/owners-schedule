"""
Test cases for calendar app models.
"""

from django.test import TestCase
from django.core.exceptions import ValidationError
from django.utils import timezone
from datetime import datetime, timedelta
from calendar_app.models import EventSeries, EventException


class EventSeriesModelTest(TestCase):
    """Test EventSeries model validation and behavior"""
    
    def setUp(self):
        self.base_start = timezone.now().replace(hour=9, minute=0, second=0, microsecond=0)
    
    def test_create_valid_series(self):
        """Test creating a valid event series"""
        series = EventSeries.objects.create(
            title="Test Event",
            start_utc=self.base_start,
            duration_minutes=30,
            freq='WEEKLY'
        )
        self.assertEqual(series.title, "Test Event")
        self.assertEqual(series.duration_minutes, 30)
        self.assertEqual(series.freq, 'WEEKLY')
        self.assertFalse(series.is_deleted)
    
    def test_fortnightly_interval_validation(self):
        """Test that fortnightly events require interval=2"""
        # This should work
        series = EventSeries(
            title="Fortnightly Event",
            start_utc=self.base_start,
            duration_minutes=30,
            freq='FORTNIGHTLY',
            interval=2
        )
        series.clean()  # Should not raise
        
        # This should fail
        series.interval = 1
        with self.assertRaises(ValidationError):
            series.clean()
    
    def test_duration_validation(self):
        """Test that duration must be positive"""
        series = EventSeries(
            title="Invalid Duration",
            start_utc=self.base_start,
            duration_minutes=0,
            freq='NEVER'
        )
        with self.assertRaises(ValidationError):
            series.clean()
        
        series.duration_minutes = -5
        with self.assertRaises(ValidationError):
            series.clean()
    
    def test_auto_correct_interval(self):
        """Test that interval is auto-corrected for certain frequencies"""
        series = EventSeries(
            title="Weekly Event",
            start_utc=self.base_start,
            duration_minutes=30,
            freq='WEEKLY',
            interval=3  # Should be corrected to 1
        )
        series.clean()
        self.assertEqual(series.interval, 1)


class EventExceptionModelTest(TestCase):
    """Test EventException model validation and behavior"""
    
    def setUp(self):
        self.base_start = timezone.now().replace(hour=9, minute=0, second=0, microsecond=0)
        self.series = EventSeries.objects.create(
            title="Test Series",
            start_utc=self.base_start,
            duration_minutes=30,
            freq='WEEKLY'
        )
    
    def test_create_deletion_exception(self):
        """Test creating an exception that deletes an occurrence"""
        exception = EventException.objects.create(
            series=self.series,
            occurrence_start_utc=self.base_start + timedelta(days=7),
            deleted=True
        )
        self.assertTrue(exception.deleted)
        self.assertEqual(exception.series, self.series)
    
    def test_create_override_exception(self):
        """Test creating an exception that overrides occurrence properties"""
        new_start = self.base_start + timedelta(days=7, hours=1)
        exception = EventException.objects.create(
            series=self.series,
            occurrence_start_utc=self.base_start + timedelta(days=7),
            override_start_utc=new_start,
            override_duration_minutes=45,
            override_title="Modified Event"
        )
        self.assertFalse(exception.deleted)
        self.assertEqual(exception.override_start_utc, new_start)
        self.assertEqual(exception.override_duration_minutes, 45)
        self.assertEqual(exception.override_title, "Modified Event")
    
    def test_unique_constraint(self):
        """Test that series+occurrence_start_utc is unique"""
        occurrence_time = self.base_start + timedelta(days=7)
        
        # First exception should work
        EventException.objects.create(
            series=self.series,
            occurrence_start_utc=occurrence_time,
            deleted=True
        )
        
        # Second exception for same occurrence should fail
        with self.assertRaises(Exception):  # IntegrityError
            EventException.objects.create(
                series=self.series,
                occurrence_start_utc=occurrence_time,
                override_title="Duplicate"
            )
    
    def test_override_duration_validation(self):
        """Test that override duration must be positive if provided"""
        exception = EventException(
            series=self.series,
            occurrence_start_utc=self.base_start + timedelta(days=7),
            override_duration_minutes=0
        )
        with self.assertRaises(ValidationError):
            exception.clean()
