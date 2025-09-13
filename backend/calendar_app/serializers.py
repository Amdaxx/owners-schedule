from rest_framework import serializers
from .models import EventSeries, EventException


class EventExceptionSerializer(serializers.ModelSerializer):
    """Serializer for EventException model with validation"""
    
    class Meta:
        model = EventException
        fields = '__all__'
    
    def validate_override_duration_minutes(self, value):
        """Ensure override duration is positive if provided"""
        if value is not None and value <= 0:
            raise serializers.ValidationError("Override duration must be positive")
        return value


class EventSeriesSerializer(serializers.ModelSerializer):
    """Serializer for EventSeries model with validation and nested exceptions"""
    
    exceptions = EventExceptionSerializer(many=True, read_only=True)
    
    class Meta:
        model = EventSeries
        fields = '__all__'
    
    def validate_duration_minutes(self, value):
        """Ensure duration is positive"""
        if value <= 0:
            raise serializers.ValidationError("Duration must be positive")
        return value
    
    def validate_freq(self, value):
        """Validate frequency choice"""
        valid_frequencies = ['NEVER', 'DAILY', 'WORKDAY', 'WEEKLY', 'FORTNIGHTLY']
        if value not in valid_frequencies:
            raise serializers.ValidationError(f"Frequency must be one of: {valid_frequencies}")
        return value
    
    def validate(self, data):
        """Cross-field validation"""
        freq = data.get('freq')
        interval = data.get('interval', 1)
        
        # Fortnightly must have interval=2
        if freq == 'FORTNIGHTLY' and interval != 2:
            raise serializers.ValidationError("Fortnightly events must have interval=2")
        
        # Other frequencies should have interval=1
        if freq in ['WEEKLY', 'WORKDAY', 'DAILY'] and interval != 1:
            data['interval'] = 1  # Auto-correct
        
        return data
