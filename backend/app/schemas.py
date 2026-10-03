from datetime import date
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

class Signup(BaseModel):
    email: EmailStr
    password: Annotated[str, Field(min_length=10, max_length=128)]
    name: Annotated[str, Field(min_length=1, max_length=80)]
    confirm_password: Annotated[str | None, Field(min_length=10, max_length=128)] = None

    @model_validator(mode='after')
    def check_account_details(self):
        self.name = self.name.strip()
        if not self.name:
            raise ValueError('Enter your name.')
        if self.confirm_password is not None and self.confirm_password != self.password:
            raise ValueError('Passwords do not match.')
        return self

class ResetJournal(BaseModel):
    model_config = ConfigDict(extra='forbid')
    confirm: Literal[True]

class Login(BaseModel):
    email: EmailStr
    password: Annotated[str, Field(min_length=1, max_length=128)]

class Profile(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False, str_strip_whitespace=True)
    name: Annotated[str, Field(min_length=1, max_length=80)]
    height_cm: Annotated[float, Field(ge=100, le=250)]
    weight_kg: Annotated[float, Field(ge=25, le=350)]
    age: Annotated[int, Field(ge=18, le=100)]
    body_fat: Annotated[float | None, Field(ge=3, le=65)] = None
    difficulty_gain: bool
    difficulty_lose: bool
    activity_type: Literal['none', 'strength', 'endurance', 'team', 'other'] = 'none'
    activity_sessions_per_week: Annotated[int, Field(ge=0, le=7)] = 0
    goal: Literal['gain', 'lose', 'maintain']
    pace: Annotated[float, Field(ge=0.05, le=0.5)]
    baseline_calories: Annotated[int, Field(ge=1500, le=4500)]

    @model_validator(mode='after')
    def check_activity(self):
        if (self.activity_type == 'none') != (self.activity_sessions_per_week == 0):
            raise ValueError('Choose an activity and 1–7 sessions per week, or choose no regular activity.')
        return self

class DailyEntry(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False, str_strip_whitespace=True)
    date: date
    weight: Annotated[float | None, Field(ge=25, le=350)] = None
    calories: Annotated[int | None, Field(ge=0, le=15000)] = None
    steps: Annotated[int | None, Field(ge=0, le=100000)] = None
    sport_type: Literal['none', 'strength', 'endurance', 'team', 'other'] | None = None
    activity_minutes: Annotated[int | None, Field(ge=0, le=600)] = None
