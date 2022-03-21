from oscar.apps.customer.models import *  # noqa isort:skip
from django.db import models
from oscar.apps.customer.abstract_models import AbstractUser

class Customer(AbstractUser):
    phone_number = models.CharField(max_length=10)
    date_of_birth = models.DateField()