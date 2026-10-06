import pytest

np = pytest.importorskip('numpy')

from app.recall import LocalRecall


class TinyEncoderRecall(LocalRecall):
    @property
    def ready(self):
        return True

    def _ensure_model(self):
        pass

    def _encode(self, batch):
        self.encoded.extend(batch)
        return np.array([[1., 0.] if '散场' in item else [0., 1.] for item in batch])


@pytest.fixture
def recall():
    instance = TinyEncoderRecall()
    instance.encoded = []
    yield instance
    instance._pool.shutdown(wait=True)


def test_repeated_search_reuses_passages_and_still_scores_each_candidate(recall):
    assert recall.scores('散场', ['散场以后', '高铁上']) == [1., 0.]
    recall.encoded.clear()
    assert recall.scores('散场', ['高铁上', '散场以后']) == [0., 1.]
    assert not any(item.startswith('passage: ') for item in recall.encoded)


def test_edited_passage_cannot_reuse_old_embedding(recall):
    assert recall.scores('散场', ['散场以后']) == [1.]
    assert recall.scores('散场', ['高铁上']) == [0.]


def test_large_corpus_can_make_progress_across_bounded_calls(recall, monkeypatch):
    original = recall._encode
    clock = [0.]
    monkeypatch.setattr('app.recall.time.monotonic', lambda: clock[0])
    def timed(batch):
        result = original(batch)
        clock[0] += 3.
        return result
    recall._encode = timed
    texts = ['散场 ' + str(index) for index in range(7)]
    with pytest.raises(TimeoutError):
        recall.scores('散场', texts)
    for _ in range(5):
        try:
            assert recall.scores('散场', texts) == [1.] * 7
            break
        except TimeoutError:
            continue
    else:
        pytest.fail('Every retry re-encoded already processed passages')
