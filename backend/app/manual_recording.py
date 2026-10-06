"""User-entered song and concert metadata, never an asserted playback resource."""
from datetime import date
from pydantic import BaseModel, ConfigDict, Field, field_validator

class ManualSong(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(min_length=1, max_length=160)
    artist: str = Field(min_length=1, max_length=160)
    @field_validator('title', 'artist', mode='before')
    @classmethod
    def trim(cls, value):
        return value.strip() if isinstance(value, str) else value

class ManualEvent(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(default='', max_length=240)
    artist: str = Field(min_length=1, max_length=160)
    date: str = Field(pattern=r'^\d{4}-\d{2}-\d{2}$')
    city: str = Field(min_length=1, max_length=80)
    venue: str = Field(min_length=1, max_length=160)
    @field_validator('title', 'artist', 'city', 'venue', mode='before')
    @classmethod
    def trim(cls, value):
        return value.strip() if isinstance(value, str) else value
    @field_validator('date')
    @classmethod
    def valid_date(cls, value):
        parsed = date.fromisoformat(value)
        if parsed.year < 1900:
            raise ValueError('日期不正确')
        return value
    def snapshot(self):
        return self.model_dump() | {'id': '', 'manual': True, 'title': self.title or f'{self.artist} · {self.city}'}
