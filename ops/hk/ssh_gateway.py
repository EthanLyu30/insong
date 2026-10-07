"""Forced SSH command: upload one release or request a verified publication."""
import os
from pathlib import Path
import re
import shlex
import sys


def permitted_command(command: str, root: Path) -> list[str]:
    root = root.absolute()
    if root.resolve() != root:
        raise ValueError('linked runtime root')
    try:
        args = shlex.split(command)
    except ValueError:
        raise ValueError('invalid publication command') from None
    if len(args) == 2 and args[0] == 'deploy' and re.fullmatch('[a-f0-9]{40}', args[1]):
        return ['sudo', '-n', '/usr/local/sbin/insong-deploy', args[1]]
    incoming = root / 'incoming'
    if len(args) == 3 and args[:2] == ['scp', '-t']:
        target = Path(args[2])
        if (incoming.resolve() != incoming or target.parent != incoming
                or not re.fullmatch(r'[a-f0-9]{40}\.tar\.gz', target.name)
                or target.is_symlink() or (target.exists() and target.stat().st_nlink != 1)):
            raise ValueError('invalid upload target')
        return ['/usr/bin/scp', '-t', str(target)]
    raise ValueError('only release upload and publication are permitted')


if __name__ == '__main__':
    try:
        args = permitted_command(os.environ.get('SSH_ORIGINAL_COMMAND', ''), Path('/opt/insong'))
    except ValueError:
        print('Unsupported publication request.', file=sys.stderr)
        raise SystemExit(64)
    os.execvp(args[0], args)
