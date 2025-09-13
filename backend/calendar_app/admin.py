from django.contrib import admin
from .models import EventSeries, EventException


@admin.register(EventSeries)
class EventSeriesAdmin(admin.ModelAdmin):
    list_display = ['title', 'freq', 'start_utc', 'duration_minutes', 'is_deleted', 'created_at']
    list_filter = ['freq', 'is_deleted', 'created_at']
    search_fields = ['title', 'notes']
    readonly_fields = ['created_at']
    ordering = ['-created_at']


@admin.register(EventException)
class EventExceptionAdmin(admin.ModelAdmin):
    list_display = ['series', 'occurrence_start_utc', 'deleted', 'override_title', 'created_at']
    list_filter = ['deleted', 'created_at']
    search_fields = ['series__title', 'override_title']
    readonly_fields = ['created_at']
    ordering = ['-created_at']
