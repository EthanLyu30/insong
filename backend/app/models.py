"""Persistent records for the fictional H5 demo."""

from datetime import datetime, timezone

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, LargeBinary, String, Text, Integer, UniqueConstraint, func, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    memory_cards: Mapped[list["MemoryCard"]] = relationship(back_populates="owner")
    sessions: Mapped[list["Session"]] = relationship(back_populates="user")


class Song(Base):
    __tablename__ = "songs"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    artist: Mapped[str] = mapped_column(String(160), nullable=False)
    version: Mapped[str] = mapped_column(String(100), nullable=False)
    source_label: Mapped[str] = mapped_column(String(100), nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    audio_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cover_url: Mapped[str | None] = mapped_column(String(240), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    memory_cards: Mapped[list["MemoryCard"]] = relationship(back_populates="song")


class MemoryCard(Base):
    __tablename__ = "memory_cards"
    __table_args__ = (
        CheckConstraint("visibility IN ('private', 'public')", name="ck_memory_cards_visibility"),
        UniqueConstraint('owner_id', 'request_key', name='uq_memory_request'),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    song_id: Mapped[int] = mapped_column(ForeignKey("songs.id"), nullable=False)
    story: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(String(80), nullable=True)
    tags_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_ids_json: Mapped[str] = mapped_column(Text, default='[]', server_default='[]')
    life_time: Mapped[str | None] = mapped_column(String(80), nullable=True)
    location_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    scene: Mapped[str | None] = mapped_column(String(160), nullable=True)
    offset_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    photo_id: Mapped[str | None] = mapped_column(ForeignKey('photos.id'), nullable=True)
    event_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    event_snapshot_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    lyric_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    life_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    theme_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    life_precision: Mapped[str] = mapped_column(String(16), default='unknown', server_default='unknown')
    revision: Mapped[int] = mapped_column(Integer, default=1, server_default='1')
    request_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    reflections_json: Mapped[str] = mapped_column(Text, default='[]', server_default='[]')
    visibility: Mapped[str] = mapped_column(
        String(10), nullable=False, default="private", server_default=text("'private'")
    )
    is_demo_sample: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("0")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now,
        server_default=func.current_timestamp(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now,
        server_default=func.current_timestamp(),
    )

    owner: Mapped[User] = relationship(back_populates="memory_cards")
    song: Mapped[Song] = relationship(back_populates="memory_cards")
    tag_links: Mapped[list["MemoryCardTag"]] = relationship(
        back_populates="memory_card", cascade="all, delete-orphan"
    )
    publication: Mapped["PublicStory | None"] = relationship(back_populates='memory', cascade='all, delete-orphan', uselist=False)


class PublicStory(Base):
    """Only fields explicitly approved for discovery; originals remain owner-only."""
    __tablename__ = 'public_stories'
    memory_id: Mapped[int] = mapped_column(ForeignKey('memory_cards.id', ondelete='CASCADE'), primary_key=True)
    excerpt: Mapped[str] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(String(80), nullable=True)
    tags_json: Mapped[str] = mapped_column(Text, default='[]', server_default='[]')
    photo_ids_json: Mapped[str] = mapped_column(Text, default='[]', server_default='[]')
    life_time: Mapped[str | None] = mapped_column(String(80), nullable=True)
    life_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    share_life_time: Mapped[bool] = mapped_column(Boolean, default=False)
    anonymous: Mapped[bool] = mapped_column(Boolean, default=True)
    author_name: Mapped[str] = mapped_column(String(80))
    offset_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    photo_id: Mapped[str | None] = mapped_column(ForeignKey('photos.id'), nullable=True)
    event_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    event_snapshot_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    lyric_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    theme_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    published: Mapped[bool] = mapped_column(Boolean, default=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    memory: Mapped[MemoryCard] = relationship(back_populates='publication')


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)

    memory_card_links: Mapped[list["MemoryCardTag"]] = relationship(back_populates="tag")


class MemoryCardTag(Base):
    __tablename__ = "memory_card_tags"

    memory_card_id: Mapped[int] = mapped_column(
        ForeignKey("memory_cards.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id"), primary_key=True)

    memory_card: Mapped[MemoryCard] = relationship(back_populates="tag_links")
    tag: Mapped[Tag] = relationship(back_populates="memory_card_links")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="sessions")


class AccountCredential(Base):
    __tablename__ = 'account_credentials'
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), primary_key=True)
    username: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)


class MemoryReceipt(Base):
    """Consumed IDs / request keys survive deletion; no private text is retained."""
    __tablename__ = 'memory_receipts'
    __table_args__ = (UniqueConstraint('owner_id', 'request_key'), {'sqlite_autoincrement': True})
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False)
    request_key: Mapped[str | None] = mapped_column(String(80), nullable=True)


class SeedMigration(Base):
    """Durable one-time sample receipt; deletion or withdrawal never reseeds it."""
    __tablename__ = 'seed_migrations'
    key: Mapped[str] = mapped_column(String(100), primary_key=True)


class Photo(Base):
    """Sanitized photo bytes; access is decided from ownership and live snapshots."""
    __tablename__ = 'photos'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False, index=True)
    content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Footprint(Base):
    __tablename__ = 'footprints'
    owner_id: Mapped[int] = mapped_column(ForeignKey('users.id'), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ArtistFollow(Base):
    __tablename__ = 'artist_follows'
    owner_id: Mapped[int] = mapped_column(ForeignKey('users.id'), primary_key=True)
    artist_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class EventWish(Base):
    __tablename__ = 'event_wishes'
    owner_id: Mapped[int] = mapped_column(ForeignKey('users.id'), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ConcertPlaylist(Base):
    __tablename__ = 'concert_playlists'
    __table_args__ = (UniqueConstraint('owner_id', 'event_id'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False, index=True)
    event_id: Mapped[str] = mapped_column(String(100), nullable=False)
    snapshot_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
