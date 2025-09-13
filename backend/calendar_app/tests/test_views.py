"""
Test cases for calendar API views.
Tests CRUD operations and occurrence-level operations.
"""

import json
from django.test import TestCase, Client
from django.utils import timezone
from django.urls import reverse
from datetime import datetime, timedelta
from calendar_app.models import EventSeries, EventException


class EventSeriesViewSetTest(TestCase):
    """Test EventSeries CRUD operations"""
    
    def setUp(self):
        self.client = Client()
        self.monday_9am = timezone.datetime(2025, 1, 20, 9, 0, 0, tzinfo=timezone.utc)
        
        self.series = EventSeries.objects.create(
            title="Test Series",
            start_utc=self.monday_9am,
            duration_minutes=30,
            freq='WEEKLY',
            byweekday=['MO']
        )
    
    def test_list_series(self):
        """Test GET /api/series/"""
        response = self.client.get('/api/series/')
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['title'], "Test Series")
        self.assertEqual(data[0]['freq'], 'WEEKLY')
    
    def test_create_series(self):
        """Test POST /api/series/"""
        new_series_data = {
            'title': 'New Test Series',
            'start_utc': '2025-01-21T10:00:00Z',
            'duration_minutes': 45,
            'freq': 'DAILY',
            'link': 'https://example.com',
            'notes': 'Test notes'
        }
        
        response = self.client.post(
            '/api/series/',
            data=json.dumps(new_series_data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 201)
        self.assertEqual(EventSeries.objects.count(), 2)
        
        created_series = EventSeries.objects.get(title='New Test Series')
        self.assertEqual(created_series.duration_minutes, 45)
        self.assertEqual(created_series.freq, 'DAILY')
    
    def test_update_series(self):
        """Test PUT /api/series/{id}/"""
        updated_data = {
            'title': 'Updated Test Series',
            'start_utc': self.monday_9am.isoformat(),
            'duration_minutes': 60,
            'freq': 'WEEKLY',
            'byweekday': ['MO']
        }
        
        response = self.client.put(
            f'/api/series/{self.series.id}/',
            data=json.dumps(updated_data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        
        self.series.refresh_from_db()
        self.assertEqual(self.series.title, 'Updated Test Series')
        self.assertEqual(self.series.duration_minutes, 60)
    
    def test_delete_series(self):
        """Test DELETE /api/series/{id}/"""
        response = self.client.delete(f'/api/series/{self.series.id}/')
        self.assertEqual(response.status_code, 204)
        
        # Series should be deleted (not soft-deleted in this case)
        self.assertEqual(EventSeries.objects.count(), 0)
    
    def test_create_series_validation(self):
        """Test validation on series creation"""
        invalid_data = {
            'title': 'Invalid Series',
            'start_utc': '2025-01-21T10:00:00Z',
            'duration_minutes': -10,  # Invalid
            'freq': 'INVALID_FREQ'  # Invalid
        }
        
        response = self.client.post(
            '/api/series/',
            data=json.dumps(invalid_data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 400)


class OccurrenceOperationsTest(TestCase):
    """Test occurrence-level operations"""
    
    def setUp(self):
        self.client = Client()
        self.monday_9am = timezone.datetime(2025, 1, 20, 9, 0, 0, tzinfo=timezone.utc)
        
        self.series = EventSeries.objects.create(
            title="Weekly Meeting",
            start_utc=self.monday_9am,
            duration_minutes=30,
            freq='WEEKLY',
            byweekday=['MO']
        )
    
    def test_create_occurrence_override(self):
        """Test POST /api/series/{id}/occurrence/"""
        second_monday = self.monday_9am + timedelta(days=7)
        override_data = {
            'occurrence_start_utc': second_monday.isoformat(),
            'override_start_utc': (second_monday + timedelta(hours=1)).isoformat(),
            'override_duration_minutes': 45,
            'override_title': 'Extended Weekly Meeting'
        }
        
        response = self.client.post(
            f'/api/series/{self.series.id}/occurrence/',
            data=json.dumps(override_data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 201)
        
        # Check that exception was created
        exception = EventException.objects.get(
            series=self.series,
            occurrence_start_utc=second_monday
        )
        self.assertEqual(exception.override_duration_minutes, 45)
        self.assertEqual(exception.override_title, 'Extended Weekly Meeting')
        self.assertFalse(exception.deleted)
    
    def test_update_existing_occurrence_override(self):
        """Test updating an existing occurrence override"""
        second_monday = self.monday_9am + timedelta(days=7)
        
        # Create initial exception
        EventException.objects.create(
            series=self.series,
            occurrence_start_utc=second_monday,
            override_title='Original Title'
        )
        
        # Update it
        override_data = {
            'occurrence_start_utc': second_monday.isoformat(),
            'override_title': 'Updated Title',
            'override_notes': 'Added some notes'
        }
        
        response = self.client.post(
            f'/api/series/{self.series.id}/occurrence/',
            data=json.dumps(override_data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        
        # Check that exception was updated
        exception = EventException.objects.get(
            series=self.series,
            occurrence_start_utc=second_monday
        )
        self.assertEqual(exception.override_title, 'Updated Title')
        self.assertEqual(exception.override_notes, 'Added some notes')
    
    def test_delete_occurrence(self):
        """Test DELETE /api/series/{id}/occurrence/"""
        second_monday = self.monday_9am + timedelta(days=7)
        
        response = self.client.delete(
            f'/api/series/{self.series.id}/occurrence/?occurrence_start_utc={second_monday.isoformat()}'
        )
        
        self.assertEqual(response.status_code, 200)
        
        # Check that deletion exception was created
        exception = EventException.objects.get(
            series=self.series,
            occurrence_start_utc=second_monday
        )
        self.assertTrue(exception.deleted)
    
    def test_occurrence_validation(self):
        """Test validation for occurrence operations"""
        # Missing occurrence_start_utc
        response = self.client.post(
            f'/api/series/{self.series.id}/occurrence/',
            data=json.dumps({'override_title': 'No Start Time'}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        
        # Invalid datetime format
        response = self.client.post(
            f'/api/series/{self.series.id}/occurrence/',
            data=json.dumps({
                'occurrence_start_utc': 'invalid-datetime',
                'override_title': 'Invalid Date'
            }),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
    
    def test_split_series(self):
        """Test POST /api/series/{id}/split/"""
        second_monday = self.monday_9am + timedelta(days=7)
        split_data = {
            'occurrence_start_utc': second_monday.isoformat(),
            'updates': {
                'title': 'New Series Title',
                'duration_minutes': 60
            }
        }
        
        response = self.client.post(
            f'/api/series/{self.series.id}/split/',
            data=json.dumps(split_data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 201)
        
        # Check response structure
        data = response.json()
        self.assertIn('original_series', data)
        self.assertIn('new_series', data)
        
        # Check that we now have 2 series
        self.assertEqual(EventSeries.objects.count(), 2)
        
        # Check original series was truncated
        self.series.refresh_from_db()
        self.assertIsNotNone(self.series.until_utc)
        self.assertLess(self.series.until_utc, second_monday)
        
        # Check new series
        new_series = EventSeries.objects.exclude(id=self.series.id).first()
        self.assertEqual(new_series.title, 'New Series Title')
        self.assertEqual(new_series.duration_minutes, 60)
        self.assertEqual(new_series.start_utc, second_monday)


class OccurrencesViewTest(TestCase):
    """Test the occurrences expansion endpoint"""
    
    def setUp(self):
        self.client = Client()
        self.monday_9am = timezone.datetime(2025, 1, 20, 9, 0, 0, tzinfo=timezone.utc)
        
        # Create a daily series
        EventSeries.objects.create(
            title="Daily Standup",
            start_utc=self.monday_9am,
            duration_minutes=15,
            freq='DAILY'
        )
        
        # Create a weekly series
        EventSeries.objects.create(
            title="Weekly Review",
            start_utc=self.monday_9am + timedelta(hours=2),
            duration_minutes=60,
            freq='WEEKLY',
            byweekday=['MO']
        )
    
    def test_get_occurrences(self):
        """Test GET /api/occurrences/"""
        start_time = self.monday_9am.isoformat()
        end_time = (self.monday_9am + timedelta(days=3)).isoformat()
        
        response = self.client.get(
            f'/api/occurrences/?start={start_time}&end={end_time}'
        )
        
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        self.assertIn('occurrences', data)
        
        occurrences = data['occurrences']
        # Should have: 3 daily standups + 1 weekly review = 4 total
        self.assertEqual(len(occurrences), 4)
        
        # Check that occurrences are sorted by start time
        start_times = [occ['occurrence_start_utc'] for occ in occurrences]
        self.assertEqual(start_times, sorted(start_times))
    
    def test_get_occurrences_with_timezone(self):
        """Test GET /api/occurrences/ with timezone conversion"""
        start_time = self.monday_9am.isoformat()
        end_time = (self.monday_9am + timedelta(days=1)).isoformat()
        
        response = self.client.get(
            f'/api/occurrences/?start={start_time}&end={end_time}&tz=Europe/London'
        )
        
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        occurrences = data['occurrences']
        
        # Each occurrence should have both UTC and local times
        for occ in occurrences:
            self.assertIn('occurrence_start_utc', occ)
            self.assertIn('localStart', occ)
            
            # Local time should be different from UTC (unless it's exactly GMT)
            utc_time = occ['occurrence_start_utc']
            local_time = occ['localStart']
            self.assertIsNotNone(local_time)
    
    def test_occurrences_validation(self):
        """Test validation for occurrences endpoint"""
        # Missing start parameter
        response = self.client.get('/api/occurrences/?end=2025-01-21T00:00:00Z')
        self.assertEqual(response.status_code, 400)
        
        # Missing end parameter
        response = self.client.get('/api/occurrences/?start=2025-01-20T00:00:00Z')
        self.assertEqual(response.status_code, 400)
        
        # Invalid datetime format
        response = self.client.get('/api/occurrences/?start=invalid&end=invalid')
        self.assertEqual(response.status_code, 400)
        
        # Invalid timezone
        start_time = self.monday_9am.isoformat()
        end_time = (self.monday_9am + timedelta(days=1)).isoformat()
        response = self.client.get(
            f'/api/occurrences/?start={start_time}&end={end_time}&tz=Invalid/Timezone'
        )
        self.assertEqual(response.status_code, 400)
    
    def test_occurrences_with_exceptions(self):
        """Test occurrences endpoint with exceptions applied"""
        # Get the daily series
        daily_series = EventSeries.objects.get(title="Daily Standup")
        
        # Delete one occurrence
        second_day = self.monday_9am + timedelta(days=1)
        EventException.objects.create(
            series=daily_series,
            occurrence_start_utc=second_day,
            deleted=True
        )
        
        # Override another occurrence
        third_day = self.monday_9am + timedelta(days=2)
        EventException.objects.create(
            series=daily_series,
            occurrence_start_utc=third_day,
            override_title="Modified Standup",
            override_duration_minutes=30
        )
        
        start_time = self.monday_9am.isoformat()
        end_time = (self.monday_9am + timedelta(days=3)).isoformat()
        
        response = self.client.get(
            f'/api/occurrences/?start={start_time}&end={end_time}'
        )
        
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        occurrences = data['occurrences']
        
        # Should have 3 occurrences (1 deleted): 2 daily + 1 weekly
        daily_occurrences = [occ for occ in occurrences if 'Standup' in occ['title']]
        self.assertEqual(len(daily_occurrences), 2)
        
        # Check that modified occurrence has new properties
        modified_occ = next((occ for occ in daily_occurrences if occ['title'] == 'Modified Standup'), None)
        self.assertIsNotNone(modified_occ)
        self.assertEqual(modified_occ['duration_minutes'], 30)
