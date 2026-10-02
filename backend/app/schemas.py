from datetime import date
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field

class Signup(BaseModel):
    email: EmailStr
    password: Annotated[str, Field(min_length=10, max_length=128)]
    name: Annotated[str, Field(min_length=1, max_length=80)]

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
    goal: Literal['gain', 'lose', 'maintain']
    pace: Annotated[float, Field(ge=0.05, le=0.5)]
    baseline_calories: Annotated[int, Field(ge=1500, le=4500)]

class DailyEntry(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False, str_strip_whitespace=True)
    date: date
    weight: Annotated[float | None, Field(ge=25, le=350)] = None
    calories: Annotated[int | None, Field(ge=0, le=15000)] = None
