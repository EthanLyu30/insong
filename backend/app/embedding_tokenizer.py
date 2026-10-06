"""The pinned XLM-R SentencePiece vocabulary, with the model's fairseq IDs."""
from dataclasses import dataclass
from pathlib import Path
import re


@dataclass
class Encoding:
    ids: list[int]
    attention_mask: list[int]


class SentencePieceTokenizer:
    def __init__(self, path: Path):
        import sentencepiece as spm
        self._model = spm.SentencePieceProcessor(model_file=str(path))
        self._normalizer = spm.SentencePieceNormalizer(model_file=str(path),
            add_dummy_prefix=False, remove_extra_whitespaces=False, escape_whitespaces=False)
        self._special = {'<s>': 0, '<pad>': 1, '</s>': 2, '<unk>': 3,
                         '<mask>': self._model.get_piece_size() + 1}
        self._max_length = 512
        self._pad_id = 1

    def enable_truncation(self, max_length=512):
        if max_length < 2:
            raise ValueError('Token limit must include BOS and EOS')
        self._max_length = max_length

    def enable_padding(self, pad_id=1, pad_token='<pad>'):
        self._pad_id = pad_id

    def _ids(self, value):
        result = []
        for part in re.split(r'(<s>|</s>|<pad>|<unk>|<mask>)', value):
            if part in self._special:
                result.append(self._special[part])
                continue
            normalized = re.sub(' {2,}', ' ', self._normalizer.normalize(part))
            result.extend(item + 1 if item else 3 for item in self._model.encode(normalized))
            # The JSON tokenizer retains a final Metaspace piece; the native
            # processor trims it, so restore the pinned tokenizer's behavior.
            if normalized.endswith(' '):
                result.append(6)
        return [0, *result[:self._max_length - 2], 2]

    def encode_batch(self, texts):
        batches = [self._ids(text) for text in texts]
        width = max((len(ids) for ids in batches), default=0)
        return [Encoding(ids + [self._pad_id] * (width - len(ids)),
                         [1] * len(ids) + [0] * (width - len(ids))) for ids in batches]


def load_tokenizer(root: Path):
    path = root / 'sentencepiece.bpe.model'
    if path.is_file():
        return SentencePieceTokenizer(path)
    # Preserve existing local installations that downloaded the JSON files only.
    from tokenizers import Tokenizer
    return Tokenizer.from_file(str(root / 'tokenizer.json'))
