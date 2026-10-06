"""Prepare the pinned public E5 weights at build time, without account tokens."""
from pathlib import Path
from tempfile import TemporaryDirectory
import argparse

from huggingface_hub import snapshot_download


REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78'
FILES = ('onnx/model_quantized.onnx', 'tokenizer.json', 'sentencepiece.bpe.model', 'config.json', 'tokenizer_config.json')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tokenizer-only', action='store_true')
    arguments = parser.parse_args()
    files = tuple(name for name in FILES if not arguments.tokenizer_only or not name.endswith('.onnx'))
    target = Path(__file__).resolve().parents[1] / 'models' / 'multilingual-e5-small'
    with TemporaryDirectory(prefix='insong-model-cache-') as cache:
        snapshot_download(repo_id='Xenova/multilingual-e5-small', revision=REVISION,
                          local_dir=target, cache_dir=cache, allow_patterns=list(files), token=False)
    if not all((target / name).is_file() for name in files):
        raise RuntimeError('The complete pinned E5 model was not downloaded')
    print(f'E5 {"tokenizer" if arguments.tokenizer_only else "model"} prepared at revision {REVISION}')


if __name__ == '__main__':
    main()
