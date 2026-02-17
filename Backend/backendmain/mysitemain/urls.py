from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('accounts/', include('allauth.urls')),   # Google OAuth: /accounts/google/login/, /accounts/google/callback/
    path('api/gemini/', include('userauth.urls')), # Gemini proxy: POST /api/gemini/
]
