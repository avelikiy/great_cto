"""Bounded extraction of a pinned package, not a general archive installer."""
import gzip
import hashlib
import os
from pathlib import Path, PurePosixPath
import stat
import sys
import tarfile
import tempfile

LIMIT = 128 * 1024 * 1024


def extract(archive, pin, destination):
    source, target = Path(archive).absolute(), Path(destination).absolute()
    if source.resolve(strict=True) != source or target.resolve(strict=True) != target:
        raise ValueError("noncanonical package extraction paths")
    info = target.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_mode & 0o077 or any(target.iterdir()):
        raise ValueError("empty private extraction directory required")
    fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as compressed:
        info = os.fstat(compressed.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > 100 * 1024 * 1024:
            raise ValueError("unsupported package archive")
        digest, size = hashlib.sha256(), 0
        while chunk := compressed.read(65536):
            size += len(chunk)
            if size > 100 * 1024 * 1024:
                raise ValueError("package archive grew beyond bound")
            digest.update(chunk)
        if size != info.st_size or digest.hexdigest() != pin:
            raise ValueError("package archive byte pin mismatch")
        compressed.seek(0)
        # Bound decompression before tarfile parses extended headers or metadata.
        with tempfile.TemporaryFile(dir=target.parent) as expanded:
            total = 0
            with gzip.GzipFile(fileobj=compressed) as stream:
                while chunk := stream.read(65536):
                    total += len(chunk)
                    if total > LIMIT:
                        raise ValueError("package expansion exceeds bound")
                    expanded.write(chunk)
            expanded.seek(0)
            with tarfile.open(fileobj=expanded, mode="r:") as bundle:
                members, names, files, total = [], set(), set(), 0
                for member in bundle:
                    name = member.name.rstrip("/")
                    parts = name.split("/")
                    if (not name or "\\" in name or any(ord(c) < 32 for c in name)
                            or PurePosixPath(name).is_absolute() or parts[0] != "package"
                            or any(part in ("", ".", "..") for part in parts)
                            or name in names or not (member.isfile() or member.isdir())
                            or member.mode & 0o7000 or member.size < 0 or member.size > 8 * 1024 * 1024
                            or len(members) >= 4000):
                        raise ValueError("unsafe package member")
                    total += member.size
                    if total > LIMIT or any("/".join(parts[:i]) in files for i in range(1, len(parts))):
                        raise ValueError("unsafe package inventory")
                    names.add(name)
                    if member.isfile():
                        files.add(name)
                    members.append(member)
                if not members:
                    raise ValueError("empty package inventory")
                # A later regular-file entry must not replace an earlier directory.
                if any(any(other.startswith(name + "/") for other in names) for name in files):
                    raise ValueError("overlapping package inventory")
                bundle.extractall(target, members=members, filter="data")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 4:
            raise ValueError("archive, pin and private destination required")
        extract(*sys.argv[1:])
        print("pinned package extracted")
    except Exception:
        # Do not echo archive metadata, package content or private paths.
        print("pinned package extraction refused", file=sys.stderr)
        sys.exit(2)
