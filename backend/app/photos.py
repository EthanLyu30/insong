"""Bounded image ingestion and access through active publication snapshots."""
import base64
import binascii
import io
import warnings
from uuid import uuid4

from fastapi import Depends, HTTPException, Request, Response
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, ValidationError
from sqlalchemy import exists, false, func, or_, select
from sqlalchemy.orm import Session as OrmSession
from starlette.concurrency import run_in_threadpool

from .models import Photo, PublicStory, User

MAX_REQUEST_BYTES = 8 * 1024 * 1024
MAX_PHOTO_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 20_000_000


class PhotoInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    data: str


def photo_url(photo_id):
    return f'/api/photos/{photo_id}' if photo_id else None


def validate_owned_photo(db, photo_id, user):
    if photo_id is not None and db.scalar(select(Photo.id).where(
            Photo.id == photo_id, Photo.owner_id == user.id)) is None:
        raise HTTPException(422, '这张照片不可用，请重新选择自己的照片。')


def sanitize_photo(data):
    if data.startswith('data:'):
        prefix, separator, data = data.partition(',')
        if not separator or prefix.lower() not in (
                'data:image/jpeg;base64', 'data:image/png;base64', 'data:image/webp;base64'):
            raise HTTPException(422, '请选择 JPEG、PNG 或 WebP 照片。')
    # Reject before allocation as well as after decoding (base64 padding differs).
    if len(data) > 4 * ((MAX_PHOTO_BYTES + 2) // 3):
        raise HTTPException(413, '照片不能超过 5 MB。')
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, '照片内容无效，请重新选择。') from None
    if len(raw) > MAX_PHOTO_BYTES:
        raise HTTPException(413, '照片不能超过 5 MB。')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as source:
                if source.format not in ('JPEG', 'PNG', 'WEBP') or source.width * source.height > MAX_PIXELS:
                    raise HTTPException(422, '请选择不超过 2000 万像素的 JPEG、PNG 或 WebP 照片。')
                source.verify()
            with Image.open(io.BytesIO(raw)) as source:
                oriented = ImageOps.exif_transpose(source)
                oriented.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
                # Copy pixels onto a fresh canvas so no EXIF, XMP, ICC or comments survive.
                clean = Image.new('RGB', oriented.size, 'white')
                if oriented.mode == 'RGBA' or 'transparency' in oriented.info:
                    rgba = oriented.convert('RGBA')
                    clean.paste(rgba, mask=rgba.getchannel('A'))
                else:
                    clean.paste(oriented.convert('RGB'))
                output = io.BytesIO()
                clean.save(output, format='JPEG', quality=88, optimize=True)
                return output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(422, '照片内容无效，请重新选择。') from None


def install_photos(app, get_db, get_user, get_optional_user):
    @app.post('/api/photos', status_code=201)
    async def upload(request: Request, db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        try:
            declared_length = int(request.headers.get('content-length', '0'))
        except ValueError:
            raise HTTPException(400, '请求长度无效。') from None
        if declared_length > MAX_REQUEST_BYTES:
            raise HTTPException(413, '照片上传请求过大。')
        body = bytearray()
        async for chunk in request.stream():
            if len(body) + len(chunk) > MAX_REQUEST_BYTES:
                raise HTTPException(413, '照片上传请求过大。')
            body.extend(chunk)
        try:
            data = PhotoInput.model_validate_json(body)
        except ValidationError:
            raise HTTPException(422, '请提供有效的照片数据。') from None
        content = await run_in_threadpool(sanitize_photo, data.data)
        photo = Photo(id=str(uuid4()), owner_id=user.id, content=content)
        db.add(photo)
        db.commit()
        return {'id': photo.id, 'url': photo_url(photo.id)}

    @app.get('/api/photos/{photo_id}')
    def get_photo(photo_id: str, db: OrmSession = Depends(get_db), user: User | None = Depends(get_optional_user)):
        gallery = func.json_each(PublicStory.photo_ids_json).table_valued('value')
        in_gallery = exists(select(1).select_from(gallery).where(gallery.c.value == Photo.id)).correlate(PublicStory, Photo)
        published = exists().where(PublicStory.published.is_(True), or_(PublicStory.photo_id == Photo.id, in_gallery))
        owned = Photo.owner_id == user.id if user else false()
        photo = db.scalar(select(Photo).where(Photo.id == photo_id, or_(owned, published)))
        if photo is None:
            raise HTTPException(404, '这张照片已经不可见。')
        return Response(photo.content, media_type='image/jpeg', headers={'X-Content-Type-Options': 'nosniff'})
