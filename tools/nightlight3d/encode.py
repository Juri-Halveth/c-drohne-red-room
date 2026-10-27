"""Validate a complete render, stage its media bundle, then promote with rollback.

Source binding checks the receipt's declared sources, not the historical origin
of arbitrary PNGs. Promotion recovers ordinary replace errors, not power loss or
concurrent writers; failed recovery preserves the staging directory.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import tempfile
import zlib


SOURCE_NAMES = ('build_scene.py', 'render_animation.py', 'scene_check.py')
WIDTH, HEIGHT, FPS, FRAME_COUNT = 1920, 1080, 30, 600
VIDEO_NAME = 'c-drohne-nightlight-3d-20261027.mp4'
POSTER_NAME = 'nightlight-3d-poster-20261027.png'
RECEIPT_NAME = 'NIGHTLIGHT_3D_RENDER.json'
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def load_render_receipt(render_root):
    receipt = json.loads((render_root / 'RENDER_RECEIPT.json').read_text(encoding='utf-8'))
    if not isinstance(receipt, dict):
        raise ValueError('Render receipt must be a JSON object')
    for key, expected in (('width', WIDTH), ('height', HEIGHT), ('fps', FPS)):
        if type(receipt.get(key)) is not int or receipt[key] != expected:
            raise ValueError('Render profile mismatch: ' + key)
    frames = receipt.get('frames')
    if (not isinstance(frames, list) or len(frames) != 2
            or any(type(value) is not int for value in frames) or frames != [1, FRAME_COUNT]):
        raise ValueError('Render must cover frames 1..600 (not a benchmark)')
    if receipt.get('engine') != 'BLENDER_EEVEE':
        raise ValueError('Render engine must be BLENDER_EEVEE')
    version = receipt.get('blenderVersion')
    if not isinstance(version, str) or not version.strip():
        raise ValueError('Render receipt needs its actual Blender version')
    hashes = receipt.get('sourceFilesSha256')
    if not isinstance(hashes, dict) or set(hashes) != set(SOURCE_NAMES):
        raise ValueError('Render receipt must bind all three render source files')
    for name in SOURCE_NAMES:
        if not isinstance(hashes[name], str) or not re.fullmatch(r'[0-9a-f]{64}', hashes[name]):
            raise ValueError('Invalid render source digest: ' + name)
    return receipt


def bind_sources(receipt, source_root, repo, commit=None):
    if commit is not None:
        if not re.fullmatch(r'[0-9a-fA-F]{40}', commit):
            raise ValueError('--render-source-commit must be exactly 40 hexadecimal characters')
        commit = commit.lower()
    hashes = {}
    for name in SOURCE_NAMES:
        if commit is None:
            data = (source_root / name).read_bytes()
        else:
            data = subprocess.check_output([
                'git', '--no-optional-locks', '-C', str(repo), 'show',
                commit + ':tools/nightlight3d/' + name,
            ])
        hashes[name] = sha256(data)
        if hashes[name] != receipt['sourceFilesSha256'][name]:
            raise ValueError('Render source digest mismatch: ' + name)
    return {'mode': 'git-commit' if commit else 'current-source-bytes',
            'commit': commit, 'sourceFilesSha256': hashes}


def validate_png(data, name):
    """Check complete PNG chunks/CRCs and the noninterlaced raster, not just IHDR."""
    def invalid():
        raise ValueError('Invalid 1920x1080 PNG frame: ' + str(name))

    if data[:8] != b'\x89PNG\r\n\x1a\n':
        invalid()
    offset = 8
    header = None
    compressed = bytearray()
    ended = False
    idat_ended = False
    saw_idat = False
    while offset < len(data):
        if offset + 12 > len(data):
            invalid()
        length = struct.unpack_from('>I', data, offset)[0]
        end = offset + 12 + length
        if end > len(data):
            invalid()
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:end - 4]
        crc = struct.unpack_from('>I', data, end - 4)[0]
        if zlib.crc32(kind + payload) & 0xffffffff != crc:
            invalid()
        if header is None and kind != b'IHDR':
            invalid()
        if kind == b'IHDR':
            if header is not None or length != 13:
                invalid()
            header = struct.unpack('>IIBBBBB', payload)
        elif kind == b'IDAT':
            if idat_ended:
                invalid()
            saw_idat = True
            compressed.extend(payload)
        elif kind == b'IEND':
            if length or not saw_idat or end != len(data):
                invalid()
            ended = True
            break
        else:
            if saw_idat:
                idat_ended = True
            # These renders use RGB/RGBA; reject unknown critical chunks.
            if not kind[0] & 32 and kind != b'PLTE':
                invalid()
        offset = end
    if not ended or header is None:
        invalid()
    width, height, depth, color, compression, filtering, interlace = header
    if ((width, height) != (WIDTH, HEIGHT) or depth not in (8, 16)
            or color not in (2, 6) or (compression, filtering, interlace) != (0, 0, 0)):
        invalid()
    stride = width * (3 if color == 2 else 4) * (depth // 8) + 1
    expected = stride * height
    try:
        decoder = zlib.decompressobj()
        raster = decoder.decompress(compressed, expected + 1)
    except zlib.error:
        invalid()
    if (len(raster) != expected or not decoder.eof or decoder.unused_data
            or decoder.unconsumed_tail or any(raster[row * stride] > 4 for row in range(height))):
        invalid()


def validate_frames(render_root):
    files = [render_root / 'frames-final' / f'frame-{i:04d}.png'
             for i in range(1, FRAME_COUNT + 1)]
    digests = []
    for file in files:
        data = file.read_bytes()
        validate_png(data, file.name)
        digests.append(sha256(data))
    return files, digests


def encode_video(files, digests, destination):
    # Feed exactly the validated bytes, avoiding a second path-based FFmpeg read
    # that could silently consume changed files after preflight.
    command = [
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'image2pipe', '-framerate', str(FPS), '-vcodec', 'png', '-i', 'pipe:0',
        '-frames:v', str(FRAME_COUNT), '-an', '-c:v', 'libx264', '-preset', 'medium',
        '-crf', '22', '-maxrate', '2500k', '-bufsize', '5000k', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', str(destination),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    try:
        for file, digest in zip(files, digests):
            data = file.read_bytes()
            if sha256(data) != digest:
                raise ValueError('Frame changed after validation: ' + file.name)
            process.stdin.write(data)
        process.stdin.close()
        returncode = process.wait()
        if returncode:
            raise subprocess.CalledProcessError(returncode, command)
    except BaseException:
        if process.poll() is None:
            process.kill()
        process.wait()
        try:
            process.stdin.close()
        except OSError:
            pass
        raise


def probe_video(video):
    info = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-count_frames', '-show_entries',
        'stream=codec_name,codec_type,width,height,pix_fmt,r_frame_rate,nb_read_frames:format=duration,size',
        '-of', 'json', str(video),
    ], encoding='utf-8'))
    streams = info.get('streams', [])
    if len(streams) != 1:
        raise ValueError('Encoded media must contain exactly one video stream')
    stream = streams[0]
    expected = {'codec_name': 'h264', 'codec_type': 'video', 'width': WIDTH,
                'height': HEIGHT, 'pix_fmt': 'yuv420p', 'r_frame_rate': '30/1',
                'nb_read_frames': str(FRAME_COUNT)}
    if any(stream.get(key) != value for key, value in expected.items()):
        raise ValueError('Encoded video profile mismatch')
    duration = float(info['format']['duration'])
    if not abs(duration - FRAME_COUNT / FPS) < .05 or not 0 < video.stat().st_size < 10 * 1024 * 1024:
        raise ValueError('Encoded video duration or size mismatch')
    return info


class RollbackError(RuntimeError):
    """The staging directory must be retained for manual recovery."""


def promote_bundle(pairs, staging):
    backups = {}
    for index, (_, target) in enumerate(pairs):
        if target.exists():
            backup = staging / f'backup-{index}'
            shutil.copy2(target, backup)
            backups[target] = backup
        else:
            backups[target] = None
    replaced = []
    try:
        for staged, target in pairs:
            os.replace(staged, target)
            replaced.append(target)
    except OSError as error:
        failed = []
        for target in reversed(replaced):
            try:
                if backups[target] is None:
                    target.unlink()
                else:
                    os.replace(backups[target], target)
            except OSError as recovery_error:
                failed.append(f'{target}: {recovery_error}')
        if failed:
            raise RollbackError(f'Bundle replacement failed; recovery files retained at {staging}; '
                                + '; '.join(failed)) from error
        raise


def cleanup_staging(staging, repo):
    resolved = staging.resolve()
    if resolved.parent != repo.resolve() or not resolved.name.startswith('.nightlight-encode-'):
        raise ValueError('Refusing cleanup outside the bound staging directory: ' + str(resolved))
    shutil.rmtree(resolved)


def encode(render_root, render_source_commit=None, *, repo=REPO, source_root=HERE):
    render_root, repo, source_root = Path(render_root), Path(repo), Path(source_root)
    # No staging or destination mutation until metadata, sources and ALL frames pass.
    render = load_render_receipt(render_root)
    binding = bind_sources(render, source_root, repo, render_source_commit)
    files, digests = validate_frames(render_root)
    assets = repo / 'dist' / 'assets'
    if not assets.is_dir():
        raise ValueError('Missing output assets directory: ' + str(assets))
    staging = Path(tempfile.mkdtemp(prefix='.nightlight-encode-', dir=repo))
    retain = False
    try:
        video = staging / VIDEO_NAME
        poster = staging / POSTER_NAME
        receipt_file = staging / RECEIPT_NAME
        encode_video(files, digests, video)
        info = probe_video(video)
        poster_data = files[269].read_bytes()
        if sha256(poster_data) != digests[269]:
            raise ValueError('Poster frame changed after validation')
        poster.write_bytes(poster_data)
        receipt = {
            'schema': 'NIGHTLIGHT_3D_MEDIA_V1',
            'engine': 'Blender ' + render['blenderVersion'] + ' EEVEE',
            'geometry': 'Authored3D mesh scene; moving drone, camera, gimbal light, rotor meshes and small head-bone animation.',
            'source': 'tools/nightlight3d/', 'render': render, 'renderSourceBinding': binding,
            'frames': {'count': FRAME_COUNT, 'orderedSha256ListDigest': sha256('\n'.join(digests).encode('ascii'))},
            'video': {'path': VIDEO_NAME, 'sha256': sha256(video.read_bytes()), 'probe': info},
            'poster': {'path': POSTER_NAME, 'sha256': digests[269]},
            'claimCeiling': 'Rendered concept animation; not real flight, sensor recognition, autonomous decisions or accepted film-quality proof.',
        }
        receipt_file.write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
        promote_bundle([(video, assets / VIDEO_NAME), (poster, assets / POSTER_NAME),
                        (receipt_file, repo / RECEIPT_NAME)], staging)
        return receipt
    except RollbackError:
        retain = True
        raise
    finally:
        if not retain:
            cleanup_staging(staging, repo)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--render-root', type=Path, default=HERE)
    parser.add_argument('--render-source-commit', help='Full 40-hex source commit; defaults to current source bytes')
    args = parser.parse_args(argv)
    receipt = encode(args.render_root, args.render_source_commit)
    print(json.dumps(receipt['video']))


if __name__ == '__main__':
    main()
