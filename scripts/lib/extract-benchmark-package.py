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
BLOCK = 512


def header_size(field):
    """Size of one tar member as the raw header says it, never as tarfile reports it."""
    if field[0] & 0x80:
        # GNU base-256: 0o200 marks a non-negative value, 0o377 a negative one.
        # Any other marker is not a size this extractor understands.
        if field[0] not in (0o200, 0o377):
            raise ValueError("unsafe package member")
        value = int.from_bytes(field[1:], "big")
        return value if field[0] == 0o200 else -((1 << (8 * (len(field) - 1))) - value)
    text = field.rstrip(b"\0 ")
    if not text or any(byte not in b"01234567" for byte in text.lstrip(b" ")):
        raise ValueError("unsafe package member")
    return int(text, 8)


def check_header_chain(stream):
    """Walk the raw 512-byte headers of the expanded archive.

    tarfile ends iteration silently at the first header it cannot parse, so a
    member it refuses to read (a negative size, since CPython 3.12.16) simply
    vanishes from the inventory and the rest of the archive is extracted as if
    it were complete. What tarfile reports therefore proves nothing about what
    the archive contains: the headers are checked here, byte by byte, and every
    byte after the terminator must be padding. This does not depend on the
    interpreter's patch version.
    """
    stream.seek(0, os.SEEK_END)
    end = stream.tell()
    stream.seek(0)
    position = 0
    while position < end:
        header = stream.read(BLOCK)
        if len(header) != BLOCK:
            raise ValueError("unsafe package member")
        if header.count(0) == BLOCK:
            # Terminator: nothing but NUL padding may follow it.
            while chunk := stream.read(65536):
                if chunk.count(0) != len(chunk):
                    raise ValueError("unsafe package member")
            return
        size = header_size(header[124:136])
        if size < 0 or size > LIMIT:
            raise ValueError("unsafe package member")
        position += BLOCK + (size + BLOCK - 1) // BLOCK * BLOCK
        if position > end:
            raise ValueError("unsafe package member")
        stream.seek(position)


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
            check_header_chain(expanded)
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
