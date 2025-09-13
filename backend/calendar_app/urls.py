"""
URL configuration for calendar_app.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EventSeriesViewSet, occurrences_view

# Create router for viewsets
router = DefaultRouter()
router.register(r'series', EventSeriesViewSet)

urlpatterns = [
    # Include viewset URLs
    path('', include(router.urls)),
    
    # Custom endpoint for expanded occurrences
    path('occurrences/', occurrences_view, name='occurrences'),
]
