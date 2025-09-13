from django.db import models
from django.core.exceptions import ValidationError


# Choices defined at module level so they can be shared
FREQUENCY_CHOICES = [
    ('NEVER', 'Never (single event)'),
    ('DAILY', 'Daily'),
    ('WORKDAY', 'Workdays (Mon-Fri)'),
    ('WEEKLY', 'Weekly'),
    ('FORTNIGHTLY', 'Fortnightly'),
]

EVENT_TYPE_CHOICES = [
    ('Meeting', 'Meeting'),
    ('1st', '1st'),
    ('Presentation', 'Presentation'),
    ('Event', 'Event'),
]


class EventSeries(models.Model):
    """
    A recurring event template that defines the base pattern and properties.
    All times are stored in UTC.
    """
    
    title = models.CharField(max_length=255)
    start_utc = models.DateTimeField(help_text="Template anchor time in UTC")
    duration_minutes = models.PositiveIntegerField(help_text="Duration in minutes")
    freq = models.CharField(max_length=20, choices=FREQUENCY_CHOICES, default='NEVER')
    byweekday = models.JSONField(
        default=list, 
        blank=True,
        help_text="List of weekday strings like ['MO', 'WE']. Empty = infer from start day"
    )
    interval = models.PositiveIntegerField(default=1, help_text="Interval for recurrence (2 for fortnightly)")
    until_utc = models.DateTimeField(null=True, blank=True, help_text="End date for recurrence in UTC")
    link = models.URLField(blank=True)
    notes = models.TextField(blank=True)
    location = models.CharField(max_length=255, blank=True, help_text="Event location")
    host = models.CharField(max_length=255, blank=True, help_text="Event host")
    event_type = models.CharField(max_length=20, choices=EVENT_TYPE_CHOICES, default='Event')
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['start_utc']
    
    def __str__(self):
        return f"{self.title} ({self.get_freq_display()})"
    
    def clean(self):
        """Validate model constraints"""
        if self.duration_minutes <= 0:
            raise ValidationError("Duration must be positive")
        
        if self.freq == 'FORTNIGHTLY' and self.interval != 2:
            raise ValidationError("Fortnightly events must have interval=2")
        
        if self.freq in ['WEEKLY', 'WORKDAY', 'DAILY'] and self.interval != 1:
            self.interval = 1  # Auto-correct for these frequencies


class EventException(models.Model):
    """
    Per-occurrence overrides or deletions for a specific event in a series.
    Identified by the original occurrence start time.
    """
    
    series = models.ForeignKey(EventSeries, on_delete=models.CASCADE, related_name='exceptions')
    occurrence_start_utc = models.DateTimeField(
        help_text="Original occurrence start time in UTC (identifies which occurrence this affects)"
    )
    deleted = models.BooleanField(default=False, help_text="If True, this occurrence is deleted")
    
    # Override fields (nullable = use series defaults)
    override_start_utc = models.DateTimeField(null=True, blank=True)
    override_duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    override_title = models.CharField(max_length=255, blank=True)
    override_link = models.URLField(blank=True)
    override_notes = models.TextField(blank=True)
    override_location = models.CharField(max_length=255, blank=True)
    override_host = models.CharField(max_length=255, blank=True)
    override_event_type = models.CharField(max_length=20, null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['series', 'occurrence_start_utc']
        ordering = ['occurrence_start_utc']
    
    def __str__(self):
        action = "Deleted" if self.deleted else "Modified"
        return f"{action} occurrence of '{self.series.title}' at {self.occurrence_start_utc}"
    
    def clean(self):
        """Validate override constraints"""
        if self.override_duration_minutes is not None and self.override_duration_minutes <= 0:
            raise ValidationError("Override duration must be positive")
