"""Pure-Python v2 regressions: temporary fixtures, fake Git and fake bpy only."""
from contextlib import redirect_stdout
import copy
import hashlib
import io
import json
from pathlib import Path
import runpy
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

import encode
from test_encode import png, probe

V2 = Path(__file__).resolve().parent.parent / 'nightlight3d_v2'
sys.path.insert(0, str(V2))
import render_contract as contract

COMMIT = 'a' * 40
NEXT_COMMIT = 'b' * 40


class RenderContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.png = png()
        cls.changed_png = png(pixels=(b'\x00' + b'\x01' * (1920 * 3)) * 1080)

    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix='nightlight-contract-test-')
        self.addCleanup(temp.cleanup)
        self.repo = Path(temp.name) / 'repo'
        self.root = self.repo / 'tools' / 'nightlight3d_v2'
        (self.root / 'sources').mkdir(parents=True)
        self.asset = self.root / 'sources' / 'texture.bin'
        self.asset.write_bytes(b'asset fixture')
        self.sources = {name: ('frozen ' + name).encode() for name in contract.SOURCE_NAMES}
        self.sources['ASSETS.json'] = json.dumps([{
            'path': self.asset.name, 'bytes': self.asset.stat().st_size,
            'sha256': contract.file_hash(self.asset),
        }]).encode()
        for name, data in self.sources.items():
            (self.root / name).write_bytes(data)
        self.scene = self.root / 'NACHTLICHT_FINAL.blend'
        self.scene.write_bytes(b'saved blend fixture')
        self.git = self.enterContext(mock.patch.object(
            contract.subprocess, 'check_output', side_effect=self.git_output))
        self.binding = {**contract.frozen_inputs(self.root, COMMIT),
                        **contract.scene_binding(self.root, str(self.scene))}
        contract.write_receipt(self.root / 'BUILD_RECEIPT.json',
                               {**self.binding, 'schema': contract.BUILD_SCHEMA})

    def git_output(self, command, **kwargs):
        self.assertEqual(command[:5], ['git', '--no-optional-locks', '-C', str(self.repo), 'show'])
        self.assertIn(command[5].split(':')[0], (COMMIT, NEXT_COMMIT))
        self.assertIn(':tools/nightlight3d_v2/', command[5])
        return self.sources[command[5].rsplit('/', 1)[1]]

    def verify(self, path=None, commit=COMMIT):
        return contract.verify_build(self.root, str(self.scene) if path is None else path, commit)

    def attempt(self, count=600, mode='final'):
        folder, receipt = contract.start_attempt(self.root, mode, self.binding)
        receipt.update(engine='CYCLES', width=1920, height=1080, fps=30,
                       blenderVersion='5.2 fixture')
        first, _ = receipt['frames']
        for frame in range(first, first + count):
            (folder / 'frames-final' / f'frame-{frame:04d}.png').write_bytes(self.png)
        return folder, receipt

    def complete(self):
        folder, receipt = self.attempt()
        return folder, contract.complete_attempt(folder, receipt)

    def run_encode(self, folder, commit=None):
        with mock.patch.object(encode, 'SOURCE_NAMES', contract.SOURCE_NAMES):
            return encode.encode(folder, commit, repo=self.repo, source_root=self.root,
                                 expected_engine='CYCLES',
                                 source_git_prefix='tools/nightlight3d_v2/', require_attempt=True)

    def assert_encode_rejected(self, folder, message):
        assets = self.repo / 'dist' / 'assets'
        assets.mkdir(parents=True, exist_ok=True)
        target = assets / encode.VIDEO_NAME
        target.write_bytes(b'previous film')
        with mock.patch.object(encode.tempfile, 'mkdtemp') as staging, \
                mock.patch.object(encode, 'encode_video') as worker:
            with self.assertRaisesRegex((ValueError, FileNotFoundError), message):
                self.run_encode(folder)
            staging.assert_not_called()
            worker.assert_not_called()
        self.assertEqual(target.read_bytes(), b'previous film')

    def test_valid_build_binds_sources_assets_and_exact_saved_scene(self):
        self.assertEqual(self.verify(), self.binding)
        self.assertIn('render_contract.py', self.binding['sourceFilesSha256'])
        self.assertIn('encode.py', self.binding['sourceFilesSha256'])
        self.assertEqual(self.binding['assetFilesSha256'][self.asset.name],
                         contract.file_hash(self.asset))

    def test_freeze_must_be_explicit_and_match_working_bytes(self):
        for commit in (None, '', 'HEAD', COMMIT[:7]):
            with self.subTest(commit=commit), self.assertRaisesRegex(ValueError, '40-hex'):
                contract.frozen_inputs(self.root, commit)
        (self.root / 'base_scene.py').write_bytes(b'working source drift')
        with self.assertRaisesRegex(ValueError, 'not frozen.*base_scene.py'):
            self.verify()

    def test_stale_build_rejected_even_when_new_sources_are_frozen(self):
        self.sources['base_scene.py'] = b'new frozen scene source'
        (self.root / 'base_scene.py').write_bytes(self.sources['base_scene.py'])
        with self.assertRaisesRegex(ValueError, 'Stale build'):
            self.verify(commit=NEXT_COMMIT)

    def test_stale_source_hashes_rejected_even_with_matching_commit_field(self):
        self.sources['base_scene.py'] = b'new frozen scene source'
        (self.root / 'base_scene.py').write_bytes(self.sources['base_scene.py'])
        with self.assertRaisesRegex(ValueError, 'sourceFilesSha256'):
            self.verify()

    def test_historical_unbound_build_requires_preparation(self):
        contract.write_receipt(self.root / 'BUILD_RECEIPT.json',
                               {'schema': 'NIGHTLIGHT_3D_VISUAL_BUILD_V2'})
        with self.assertRaisesRegex(ValueError, 'rebuild required'):
            self.verify()

    def test_different_loaded_scene_rejected_even_with_identical_bytes(self):
        other = self.root / 'other.blend'
        other.write_bytes(self.scene.read_bytes())
        for path in ('', str(other)):
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, 'filepath'):
                self.verify(path)

    def test_saved_scene_replacement_and_asset_drift_are_rejected(self):
        original = self.scene.read_bytes()
        self.scene.write_bytes(b'different saved scene')
        with self.assertRaisesRegex(ValueError, 'sceneSha256'):
            self.verify()
        self.scene.write_bytes(original)
        self.asset.write_bytes(b'different asset')
        with self.assertRaisesRegex(ValueError, 'Asset changed'):
            self.verify()

    def test_renderer_checks_actual_bpy_filepath_before_device_or_render(self):
        fake = SimpleNamespace(data=SimpleNamespace(filepath=str(self.root / 'wrong.blend')),
                               context=mock.Mock(), ops=mock.Mock())
        real_verify = contract.verify_build
        with mock.patch.dict(sys.modules, {'bpy': fake}), \
                mock.patch.object(sys, 'argv', ['blender', '--', 'final', '--source-commit', COMMIT]), \
                mock.patch.object(sys, 'path', list(sys.path)), \
                mock.patch.object(contract, 'verify_build', side_effect=lambda root, path, commit:
                                  real_verify(self.root, path, commit)):
            with self.assertRaisesRegex(ValueError, 'filepath'):
                runpy.run_path(str(V2 / 'render_animation.py'), run_name='__main__')
        self.assertEqual(fake.context.mock_calls, [])
        self.assertEqual(fake.ops.mock_calls, [])

    def run_fake_renderer(self, change_scene=False):
        scene = SimpleNamespace(render=SimpleNamespace(image_settings=SimpleNamespace(),
                                                       use_motion_blur=True),
                                cycles=SimpleNamespace())
        prefs = SimpleNamespace(devices=[SimpleNamespace(type='OPTIX')], get_devices=lambda: None)
        def render(**kwargs):
            self.assertEqual(kwargs, {'animation': True})
            self.assertEqual(scene.frame_step, 1)
            self.assertFalse(scene.render.use_overwrite)
            for frame in range(scene.frame_start, scene.frame_end + 1):
                Path(scene.render.filepath + f'{frame:04d}.png').write_bytes(self.png)
            if change_scene:
                self.scene.write_bytes(b'scene replaced during render')
        fake = SimpleNamespace(data=SimpleNamespace(filepath=str(self.scene)),
                               context=SimpleNamespace(scene=scene, preferences=SimpleNamespace(
                                   addons={'cycles': SimpleNamespace(preferences=prefs)})),
                               ops=SimpleNamespace(render=SimpleNamespace(render=render)),
                               app=SimpleNamespace(version_string='fixture Blender'))
        real_verify, real_start = contract.verify_build, contract.start_attempt
        with mock.patch.dict(sys.modules, {'bpy': fake}), \
                mock.patch.object(sys, 'argv', ['blender', '--', 'pilot', '--source-commit', COMMIT]), \
                mock.patch.object(sys, 'path', list(sys.path)), redirect_stdout(io.StringIO()), \
                mock.patch.object(contract, 'verify_build', side_effect=lambda root, path, commit:
                                  real_verify(self.root, path, commit)) as verify, \
                mock.patch.object(contract, 'start_attempt', side_effect=lambda root, mode, binding:
                                  real_start(self.root, mode, binding)):
            runpy.run_path(str(V2 / 'render_animation.py'), run_name='__main__')
        self.assertEqual(verify.call_count, 2)
        self.assertEqual(verify.call_args.args[1], str(self.scene))
        return json.loads(next((self.root / 'render' / 'attempts').glob('*/RENDER_RECEIPT.json')).read_text())

    def test_renderer_carries_preverified_digest_and_completed_frame_hashes(self):
        receipt = self.run_fake_renderer()
        self.assertEqual(receipt['sceneSha256'], self.binding['sceneSha256'])
        self.assertEqual(receipt['sourceFilesSha256'], self.binding['sourceFilesSha256'])
        self.assertEqual(receipt['status'], 'COMPLETED')
        self.assertEqual(receipt['orderedFrameSha256'], [hashlib.sha256(self.png).hexdigest()] * 4)

    def test_scene_replacement_during_render_never_gets_completed_receipt(self):
        with self.assertRaisesRegex(ValueError, 'sceneSha256'):
            self.run_fake_renderer(change_scene=True)
        receipt = json.loads(next((self.root / 'render' / 'attempts').glob('*/RENDER_RECEIPT.json')).read_text())
        self.assertEqual(receipt['status'], 'RENDERING')
        self.assertNotIn('orderedFrameSha256', receipt)

    def test_unique_partial_attempt_cannot_borrow_earlier_success(self):
        previous, _ = self.complete()
        old_receipt = (previous / 'RENDER_RECEIPT.json').read_bytes()
        partial, receipt = self.attempt(count=111)
        self.assertNotEqual(previous, partial)
        with self.assertRaisesRegex(ValueError, 'completed frame sequence'):
            contract.complete_attempt(partial, receipt)
        self.assertEqual(json.loads((partial / 'RENDER_RECEIPT.json').read_text())['status'], 'RENDERING')
        # Even copying an earlier successful receipt cannot supply missing frames.
        (partial / 'RENDER_RECEIPT.json').write_bytes(old_receipt)
        self.assert_encode_rejected(partial, 'frame-0112.png')
        self.assertEqual((previous / 'RENDER_RECEIPT.json').read_bytes(), old_receipt)
        self.assertEqual(len(list((previous / 'frames-final').iterdir())), 600)

    def test_full_frame_folder_cannot_borrow_receipt_from_another_attempt(self):
        previous, _ = self.complete()
        other, _ = self.attempt()
        (other / 'RENDER_RECEIPT.json').write_bytes((previous / 'RENDER_RECEIPT.json').read_bytes())
        self.assert_encode_rejected(other, 'different attempt folder')

    def test_partial_rerun_over_completed_frames_rejected_by_ordered_hashes(self):
        folder, receipt = self.complete()
        (folder / 'frames-final' / 'frame-0001.png').write_bytes(self.changed_png)
        self.assert_encode_rejected(folder, 'frame hashes')
        self.assertEqual(json.loads((folder / 'RENDER_RECEIPT.json').read_text()), receipt)

    def test_reordered_manifest_and_incomplete_status_are_rejected(self):
        folder, receipt = self.complete()
        changed = folder / 'frames-final' / 'frame-0002.png'
        changed.write_bytes(self.changed_png)
        receipt = contract.complete_attempt(folder, receipt)
        reordered = copy.deepcopy(receipt)
        reordered['orderedFrameSha256'][:2] = reversed(reordered['orderedFrameSha256'][:2])
        contract.write_receipt(folder / 'RENDER_RECEIPT.json', reordered)
        self.assert_encode_rejected(folder, 'frame hashes')
        receipt['status'] = 'RENDERING'
        contract.write_receipt(folder / 'RENDER_RECEIPT.json', receipt)
        self.assert_encode_rejected(folder, 'completed final')

    def test_pilot_completion_and_unexpected_frames_do_not_authorize_final(self):
        pilot, receipt = self.attempt(count=4, mode='pilot')
        contract.complete_attempt(pilot, receipt)
        self.assert_encode_rejected(pilot, '1..600')
        folder, receipt = self.attempt()
        (folder / 'frames-final' / 'frame-0601.png').write_bytes(self.png)
        with self.assertRaisesRegex(ValueError, 'completed frame sequence'):
            contract.complete_attempt(folder, receipt)

    def test_valid_attempt_encodes_with_its_frozen_commit_and_ordered_hashes(self):
        folder, render = self.complete()
        (self.repo / 'dist' / 'assets').mkdir(parents=True)
        with mock.patch.object(encode, 'encode_video',
                               side_effect=lambda files, hashes, dest: dest.write_bytes(b'video')), \
                mock.patch.object(encode, 'probe_video', return_value=probe()):
            result = self.run_encode(folder)
        self.assertEqual(result['renderSourceBinding']['commit'], COMMIT)
        self.assertEqual(result['render']['sceneSha256'], self.binding['sceneSha256'])
        self.assertEqual(result['frames']['orderedSha256ListDigest'], hashlib.sha256(
            '\n'.join(render['orderedFrameSha256']).encode('ascii')).hexdigest())
        with self.assertRaisesRegex(ValueError, 'differs.*freeze'):
            self.run_encode(folder, NEXT_COMMIT)


if __name__ == '__main__':
    unittest.main()
