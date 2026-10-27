"""Temporary-file encoder tests; no actual Git, FFmpeg, Blender or network calls."""
from pathlib import Path
from contextlib import contextmanager
import copy
import io
import json
import os
import struct
import subprocess
import tempfile
import unittest
from unittest import mock
import zlib

import encode


COMMIT = '746c962c94fcef57e70880cc7318ad513ae19e02'
SOURCES = {name: ('frozen ' + name).encode('ascii') for name in encode.SOURCE_NAMES}


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


def png(width=1920, height=1080, pixels=None):
    if pixels is None:
        pixels = (b'\x00' + bytes(width * 3)) * height
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b''))


def render_receipt():
    return {'engine': 'BLENDER_EEVEE', 'width': 1920, 'height': 1080, 'fps': 30,
            'frames': [1, 600], 'blenderVersion': '5.2.4 LTS',
            'sourceFilesSha256': {name: encode.sha256(data) for name, data in SOURCES.items()}}


def probe():
    return {'streams': [{'codec_name': 'h264', 'codec_type': 'video', 'width': 1920,
                         'height': 1080, 'pix_fmt': 'yuv420p', 'r_frame_rate': '30/1',
                         'nb_read_frames': '600'}], 'format': {'duration': '20.0', 'size': '9'}}


class EncodeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.png = png()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='nightlight-encode-test-')
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name) / 'repo'
        self.assets = self.repo / 'dist' / 'assets'
        self.assets.mkdir(parents=True)
        self.root = Path(self.temp.name) / 'render'
        self.root.mkdir()
        self.source = self.repo / 'tools' / 'nightlight3d'
        self.source.mkdir(parents=True)
        for name, data in SOURCES.items():
            (self.source / name).write_bytes(data)
        self.targets = [self.assets / encode.VIDEO_NAME, self.assets / encode.POSTER_NAME,
                        self.repo / encode.RECEIPT_NAME]
        self.originals = {target: ('old ' + target.name).encode('ascii') for target in self.targets}
        for target, data in self.originals.items():
            target.write_bytes(data)
        self.write_receipt(render_receipt())

    def write_receipt(self, value):
        (self.root / 'RENDER_RECEIPT.json').write_text(json.dumps(value), encoding='utf-8')

    def make_frames(self):
        directory = self.root / 'frames-final'
        directory.mkdir()
        for i in range(1, 601):
            (directory / f'frame-{i:04d}.png').write_bytes(self.png)

    def run_encode(self, commit=None):
        return encode.encode(self.root, commit, repo=self.repo, source_root=self.source)

    def assert_unchanged(self):
        for target, data in self.originals.items():
            self.assertEqual(target.read_bytes(), data)
        self.assertEqual(list(self.repo.glob('.nightlight-encode-*')), [])

    @contextmanager
    def media(self, info=None):
        def fake_encode(files, digests, destination):
            self.assertEqual(len(files), 600)
            self.assertEqual(len(digests), 600)
            self.assertNotIn(destination, self.targets)
            destination.write_bytes(b'new-video')

        def fake_output(command, **kwargs):
            if command[0] == 'git':
                self.assertEqual(command[:5], ['git', '--no-optional-locks', '-C', str(self.repo), 'show'])
                self.assertTrue(command[5].startswith(COMMIT + ':tools/nightlight3d/'))
                return SOURCES[command[5].rsplit('/', 1)[1]]
            self.assertEqual(command[0], 'ffprobe')
            return json.dumps(probe() if info is None else info)

        with mock.patch.object(encode, 'encode_video', side_effect=fake_encode) as worker, \
                mock.patch.object(encode.subprocess, 'check_output', side_effect=fake_output):
            yield worker

    def test_missing_malformed_and_benchmark_receipts_fail_before_mutation(self):
        receipt_file = self.root / 'RENDER_RECEIPT.json'
        benchmark = render_receipt()
        benchmark['frames'] = [1, 4]
        for value in (None, '{broken', json.dumps(benchmark), '[]'):
            with self.subTest(value=value):
                if value is None:
                    receipt_file.unlink()
                else:
                    receipt_file.write_text(value, encoding='utf-8')
                with mock.patch.object(encode.tempfile, 'mkdtemp') as staging, \
                        mock.patch.object(encode.subprocess, 'Popen') as process, \
                        mock.patch.object(encode.subprocess, 'check_output') as external:
                    with self.assertRaises((ValueError, FileNotFoundError)):
                        self.run_encode()
                    staging.assert_not_called()
                    process.assert_not_called()
                    external.assert_not_called()
                self.assert_unchanged()

    def test_invalid_profile_and_source_metadata_fail_before_mutation(self):
        for key, value in [('width', 1280), ('height', 720), ('fps', 24), ('fps', 30.0),
                           ('frames', [True, 600]), ('frames', [0, 599]),
                           ('engine', 'CYCLES'), ('blenderVersion', ''),
                           ('sourceFilesSha256', {}), ('sourceFilesSha256', None)]:
            with self.subTest(key=key, value=value):
                receipt = render_receipt()
                receipt[key] = value
                self.write_receipt(receipt)
                with mock.patch.object(encode.tempfile, 'mkdtemp') as staging:
                    with self.assertRaises(ValueError):
                        self.run_encode()
                    staging.assert_not_called()
                self.assert_unchanged()

    def test_current_source_drift_fails_before_frames_or_mutation(self):
        (self.source / 'build_scene.py').write_bytes(b'changed after render')
        with mock.patch.object(encode, 'validate_frames') as frames, \
                mock.patch.object(encode.tempfile, 'mkdtemp') as staging:
            with self.assertRaisesRegex(ValueError, 'digest mismatch: build_scene.py'):
                self.run_encode()
            frames.assert_not_called()
            staging.assert_not_called()
        self.assert_unchanged()

    def test_invalid_commit_is_rejected_without_git(self):
        for commit in ('HEAD', 'a' * 39, 'g' * 40, 'a' * 41):
            with self.subTest(commit=commit), mock.patch.object(encode.subprocess, 'check_output') as external:
                with self.assertRaisesRegex(ValueError, '40 hexadecimal'):
                    self.run_encode(commit)
                external.assert_not_called()
                self.assert_unchanged()

    def test_commit_hash_mismatch_and_git_failure_fail_before_mutation(self):
        for output in (b'incorrect committed bytes', subprocess.CalledProcessError(128, ['git'])):
            with self.subTest(output=output), mock.patch.object(encode.subprocess, 'check_output') as external, \
                    mock.patch.object(encode.tempfile, 'mkdtemp') as staging:
                if isinstance(output, Exception):
                    external.side_effect = output
                else:
                    external.return_value = output
                with self.assertRaises((ValueError, subprocess.CalledProcessError)):
                    self.run_encode(COMMIT)
                staging.assert_not_called()
                self.assert_unchanged()

    def test_bad_last_frame_rejected_after_all_preceding_frames_before_staging(self):
        self.make_frames()
        last = self.root / 'frames-final' / 'frame-0600.png'
        last.write_bytes(self.png[:-1])
        with mock.patch.object(encode, 'validate_png', wraps=encode.validate_png) as validator, \
                mock.patch.object(encode.tempfile, 'mkdtemp') as staging:
            with self.assertRaisesRegex(ValueError, 'frame-0600.png'):
                self.run_encode()
            self.assertEqual(validator.call_count, 600)
            staging.assert_not_called()
        self.assert_unchanged()

    def test_missing_last_frame_fails_before_staging(self):
        self.make_frames()
        (self.root / 'frames-final' / 'frame-0600.png').unlink()
        with mock.patch.object(encode, 'validate_png'), mock.patch.object(encode.tempfile, 'mkdtemp') as staging:
            with self.assertRaises(FileNotFoundError):
                self.run_encode()
            staging.assert_not_called()
        self.assert_unchanged()

    def test_valid_default_binding_version_and_bundle(self):
        self.make_frames()
        with self.media():
            receipt = self.run_encode()
        self.assertEqual(receipt['engine'], 'Blender 5.2.4 LTS EEVEE')
        self.assertEqual(receipt['renderSourceBinding']['mode'], 'current-source-bytes')
        self.assertIsNone(receipt['renderSourceBinding']['commit'])
        self.assertEqual(receipt['renderSourceBinding']['sourceFilesSha256'], render_receipt()['sourceFilesSha256'])
        self.assertEqual(receipt['frames']['orderedSha256ListDigest'], encode.sha256(
            '\n'.join([encode.sha256(self.png)] * 600).encode('ascii')))
        self.assertEqual(self.targets[0].read_bytes(), b'new-video')
        self.assertEqual(self.targets[1].read_bytes(), self.png)
        self.assertEqual(json.loads(self.targets[2].read_text(encoding='utf-8')), receipt)
        self.assertEqual(list(self.repo.glob('.nightlight-encode-*')), [])

    def test_valid_commit_binding_uses_frozen_bytes_despite_current_drift(self):
        self.make_frames()
        for name in encode.SOURCE_NAMES:
            (self.source / name).unlink()
        with self.media():
            receipt = self.run_encode(COMMIT.upper())
        self.assertEqual(receipt['renderSourceBinding']['mode'], 'git-commit')
        self.assertEqual(receipt['renderSourceBinding']['commit'], COMMIT)
        self.assertEqual(receipt['renderSourceBinding']['sourceFilesSha256'], render_receipt()['sourceFilesSha256'])

    def test_encoder_failure_keeps_existing_bundle(self):
        self.make_frames()
        with mock.patch.object(encode, 'encode_video', side_effect=OSError('synthetic encoder failure')):
            with self.assertRaisesRegex(OSError, 'encoder failure'):
                self.run_encode()
        self.assert_unchanged()

    def test_bad_probe_keeps_existing_bundle(self):
        self.make_frames()
        info = probe()
        info['streams'][0]['nb_read_frames'] = '4'
        with self.media(info):
            with self.assertRaisesRegex(ValueError, 'profile mismatch'):
                self.run_encode()
        self.assert_unchanged()

    def test_replace_failure_restores_existing_bundle(self):
        self.make_frames()
        real_replace = os.replace
        for fail_target in self.targets[1:]:
            def replace(source, target):
                if target == fail_target and Path(source).name == target.name:
                    raise PermissionError('synthetic locked target')
                return real_replace(source, target)
            with self.subTest(target=fail_target), self.media(), \
                    mock.patch.object(encode.os, 'replace', side_effect=replace):
                with self.assertRaises(PermissionError):
                    self.run_encode()
            self.assert_unchanged()

    def test_replace_failure_removes_newly_created_targets(self):
        self.make_frames()
        for target in self.targets:
            target.unlink()
        real_replace = os.replace
        def replace(source, target):
            if target == self.targets[2]:
                raise PermissionError('synthetic locked receipt')
            return real_replace(source, target)
        with self.media(), mock.patch.object(encode.os, 'replace', side_effect=replace):
            with self.assertRaises(PermissionError):
                self.run_encode()
        self.assertTrue(all(not target.exists() for target in self.targets))
        self.assertEqual(list(self.repo.glob('.nightlight-encode-*')), [])

    def test_failed_rollback_preserves_recovery_backups(self):
        self.make_frames()
        real_replace = os.replace
        def replace(source, target):
            if target == self.targets[1] or Path(source).name.startswith('backup-'):
                raise PermissionError('synthetic recovery lock')
            return real_replace(source, target)
        with self.media(), mock.patch.object(encode.os, 'replace', side_effect=replace):
            with self.assertRaisesRegex(encode.RollbackError, 'recovery files retained'):
                self.run_encode()
        retained = list(self.repo.glob('.nightlight-encode-*'))
        self.assertEqual(len(retained), 1)
        self.assertEqual((retained[0] / 'backup-0').read_bytes(), self.originals[self.targets[0]])

    def test_cleanup_refuses_unbound_or_wrong_prefix_path(self):
        for target in (self.repo, self.root, self.repo / 'unrelated',
                       self.repo / 'nested' / '.nightlight-encode-child'):
            with self.subTest(target=target), mock.patch.object(encode.shutil, 'rmtree') as remove:
                with self.assertRaisesRegex(ValueError, 'Refusing cleanup'):
                    encode.cleanup_staging(target, self.repo)
                remove.assert_not_called()

    def test_png_rejects_crc_truncation_dimensions_raster_and_filter_defects(self):
        corrupt = bytearray(self.png)
        corrupt[-1] ^= 1
        bad_filter = (b'\x05' + bytes(1920 * 3)) * 1080
        for data in (bytes(corrupt), self.png[:-1], self.png + b'trailing', png(1280, 720),
                     png(pixels=b'too short'), png(pixels=bad_filter)):
            with self.subTest(length=len(data)), self.assertRaises(ValueError):
                encode.validate_png(data, 'synthetic.png')
        encode.validate_png(self.png, 'valid.png')

    def test_stream_uses_validated_bytes_and_rejects_changed_inputs(self):
        file = self.root / 'test.png'
        file.write_bytes(self.png)
        process = mock.Mock()
        process.wait.return_value = 0
        process.poll.return_value = None
        with mock.patch.object(encode.subprocess, 'Popen', return_value=process) as popen:
            encode.encode_video([file], [encode.sha256(self.png)], self.root / 'stage.mp4')
            process.stdin.write.assert_called_once_with(self.png)
            self.assertIn('pipe:0', popen.call_args.args[0])
            process.reset_mock()
            file.write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'changed after validation'):
                encode.encode_video([file], [encode.sha256(self.png)], self.root / 'stage.mp4')
            process.stdin.write.assert_not_called()
            process.kill.assert_called_once()

    def test_cli_forwards_source_commit(self):
        with mock.patch.object(encode, 'encode', return_value={'video': {'path': 'test.mp4'}}) as worker, \
                mock.patch('sys.stdout', new_callable=io.StringIO):
            encode.main(['--render-root', str(self.root), '--render-source-commit', COMMIT])
        worker.assert_called_once_with(self.root, COMMIT)


if __name__ == '__main__':
    unittest.main()
