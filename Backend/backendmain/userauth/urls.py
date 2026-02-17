from django.urls import path
from . import views

app_name = 'userauth'

urlpatterns = [
    path('', views.gemini_proxy, name='gemini_proxy'),
]
