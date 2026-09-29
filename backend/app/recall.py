"""Local-only E5 inference. No story or query is sent to a model provider."""
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from pathlib import Path
import re
import threading
import time

from fastapi import Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from .memories import serialize_memory
from .models import MemoryCard, User

MODEL_ROOT = Path(__file__).resolve().parents[1] / 'models' / 'multilingual-e5-small'


class LocalRecall:
    def __init__(self):
        self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix='private-recall')
        self._slot = threading.BoundedSemaphore(1)
        self._session = None
        self._tokenizer = None

    @property
    def ready(self):
        return (MODEL_ROOT / 'onnx/model_quantized.onnx').is_file() and (MODEL_ROOT / 'tokenizer.json').is_file()

    def scores(self, query, texts):
        if not self.ready or not self._slot.acquire(blocking=False):
            raise RuntimeError('local model unavailable or busy')
        try:
            future = self._pool.submit(self._job, query, texts)
        except Exception:
            self._slot.release()
            raise
        return future.result(timeout=5)

    def _job(self, query, texts):
        try:
            import numpy as np
            import onnxruntime as ort
            from tokenizers import Tokenizer
            deadline = time.monotonic() + 4.5
            if self._session is None:
                options = ort.SessionOptions()
                options.intra_op_num_threads = 2
                options.inter_op_num_threads = 1
                self._session = ort.InferenceSession(str(MODEL_ROOT / 'onnx/model_quantized.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
                self._tokenizer = Tokenizer.from_file(str(MODEL_ROOT / 'tokenizer.json'))
                self._tokenizer.enable_truncation(max_length=512)
                self._tokenizer.enable_padding(pad_id=1, pad_token='<pad>')
            def encode(batch):
                enc = self._tokenizer.encode_batch(batch)
                mask = np.array([x.attention_mask for x in enc], dtype=np.int64)
                inputs = {'input_ids': np.array([x.ids for x in enc], dtype=np.int64), 'attention_mask': mask,
                          'token_type_ids': np.zeros_like(mask)}
                hidden = self._session.run(None, {x.name: inputs[x.name] for x in self._session.get_inputs()})[0]
                pooled = (hidden * mask[:, :, None]).sum(axis=1) / mask.sum(axis=1)[:, None]
                return pooled / np.maximum(np.linalg.norm(pooled, axis=1, keepdims=True), 1e-9)
            vector = encode(['query: ' + query])[0]
            # Chunk long originals; the ending of a 500-character memory remains searchable.
            chunks = [(i, text[start:start + 260]) for i, text in enumerate(texts) for start in range(0, len(text), 230)]
            scores = [0.] * len(texts)
            for start in range(0, len(chunks), 8):
                if time.monotonic() > deadline:
                    raise TimeoutError('local inference time budget')
                batch = chunks[start:start + 8]
                vectors = encode(['passage: ' + text for _, text in batch])
                for (index, _), score in zip(batch, vectors @ vector):
                    scores[index] = max(scores[index], float(score))
            return scores
        finally:
            self._slot.release()


local_recall = LocalRecall()


class SearchInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    query: str = Field(min_length=1, max_length=200)
    mode: str = 'semantic'
    song_id: int | None = Field(default=None, gt=0, lt=2**63, strict=True)

    @field_validator('query')
    @classmethod
    def query_nonblank(cls, value):
        if not value.strip():
            raise ValueError('请写一点你记得的线索')
        return value.strip()

    @field_validator('mode')
    @classmethod
    def valid_mode(cls, value):
        if value not in ('keyword', 'semantic'):
            raise ValueError('未知的查找方式')
        return value


def keyword_score(query, text):
    query = re.sub(r'\s+', '', query.lower())
    text = re.sub(r'\s+', '', text.lower())
    if query in text:
        return 1.
    terms = set(re.findall(r'[a-z0-9]+', query))
    han = ''.join(re.findall(r'[\u4e00-\u9fff]', query))
    terms.update(han[i:i + 2] for i in range(len(han) - 1))
    matched = sum(term in text for term in terms)
    return matched / max(len(terms), 1) if matched else 0.


def install_recall(app, get_db, get_user):
    app.state.recall = local_recall

    @app.get('/api/search/status')
    def status():
        return {'semantic_available': app.state.recall.ready, 'processing': 'local', 'model': 'multilingual-e5-small'}

    @app.post('/api/memories/search')
    def search(data: SearchInput, db: OrmSession = Depends(get_db), user: User = Depends(get_user)):
        statement = select(MemoryCard).where(MemoryCard.owner_id == user.id)
        if data.song_id is not None:
            statement = statement.where(MemoryCard.song_id == data.song_id)
        cards = list(db.scalars(statement.order_by(MemoryCard.created_at.desc())))
        originals = {card.id: (card.revision, card.story) for card in cards}
        texts = [card.story + ' ' + (card.life_time or '') + ' ' + card.song.title for card in cards]
        lexical = [keyword_score(data.query, text) for text in texts]
        mode, notice = data.mode, ''
        scores = lexical
        if cards and mode == 'semantic':
            try:
                scores = app.state.recall.scores(data.query, texts)
            except Exception:
                mode = 'keyword'
                notice = '本地语义查找暂时不可用，已用关键词继续查找。'
        # Conservative initial cutoff; cosine similarity is not a probability.
        # Calibrate on a larger consented evaluation set before broad release.
        threshold = .865 if mode == 'semantic' else .14
        ranked = sorted(zip(cards, scores, lexical), key=lambda x: (x[1], x[2]), reverse=True)
        ids = [card.id for card, score, exact in ranked if score >= threshold or exact == 1.][:3]
        # End the earlier read and recheck database ownership/revision after inference.
        db.rollback()
        db.expire_all()
        results = []
        for memory_id in ids:
            fresh = db.scalar(select(MemoryCard).where(MemoryCard.id == memory_id, MemoryCard.owner_id == user.id))
            if fresh is None or originals[memory_id] != (fresh.revision, fresh.story):
                continue
            results.append({'memory': serialize_memory(fresh), 'evidence': fresh.story,
                            'match_label': '相近的经历线索' if mode == 'semantic' else '原文或记录信息包含关键词'})
        return {'items': results, 'mode': mode, 'notice': notice}
