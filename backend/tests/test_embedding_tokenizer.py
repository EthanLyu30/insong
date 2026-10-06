from pathlib import Path

import pytest


@pytest.fixture(scope='module')
def tokenizer_pair():
    pytest.importorskip('sentencepiece')
    from tokenizers import Tokenizer
    from app.embedding_tokenizer import SentencePieceTokenizer

    root = Path(__file__).resolve().parents[1] / 'models' / 'multilingual-e5-small'
    if not (root / 'sentencepiece.bpe.model').is_file():
        pytest.skip('Pinned tokenizer files are required')
    reference = Tokenizer.from_file(str(root / 'tokenizer.json'))
    reference.enable_truncation(max_length=512)
    reference.enable_padding(pad_id=1, pad_token='<pad>')
    compact = SentencePieceTokenizer(root / 'sentencepiece.bpe.model')
    compact.enable_truncation(max_length=512)
    compact.enable_padding(pad_id=1, pad_token='<pad>')
    return reference, compact


@pytest.mark.parametrize('texts', [
    ['query: 散场以后，和朋友走回去。', 'passage: 高铁上的一首歌'],
    ['query: We met again after the concert.', 'query: ＱＱ音乐 café'],
    ['  query: 雨夜\n  朋友  ', 'query: café\u0301\u200b', '  ', 'query: café\u00a0'],
    ['query: 上海🎵👩‍🎤', 'query: <mask> 与 <s>', 'query: <pad><unk></s>'],
    ['query: ' + '演唱会的朋友' * 180, 'passage: short'],
])
def test_compact_tokenizer_preserves_ids_padding_and_truncation(tokenizer_pair, texts):
    reference, compact = tokenizer_pair
    wanted = reference.encode_batch(texts)
    actual = compact.encode_batch(texts)
    assert [item.ids for item in actual] == [item.ids for item in wanted]
    assert [item.attention_mask for item in actual] == [item.attention_mask for item in wanted]


def test_compact_tokenizer_keeps_eos_when_truncated(tokenizer_pair):
    _, compact = tokenizer_pair
    result = compact.encode_batch(['演唱会的朋友' * 500])[0]
    assert len(result.ids) == 512
    assert result.ids[0] == 0 and result.ids[-1] == 2
