"""
WSGI config for mysite project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/wsgi/
"""

import os
import pymysql
pymysql.install_as_MySQLdb()
import MySQLdb
MySQLdb.version_info = (2, 2, 1, 'final', 0)  # satisfy Django's version check

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mysitemain.settings')

application = get_wsgi_application()
