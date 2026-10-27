"""Use the tested transactional encoder with this explicit Cycles/source layout."""
import argparse, importlib.util, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]
spec = importlib.util.spec_from_file_location('checked_nightlight_encoder', ROOT.parent / 'nightlight3d' / 'encode.py')
checked = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checked)
checked.SOURCE_NAMES = ('base_scene.py', 'upgrade_scene.py', 'professional_architecture.py',
                        'art_direction.py', 'cinematic_lighting.py', 'foliage_details.py',
                        'prepare_scene.py', 'render_animation.py', 'ASSETS.json')
checked.VIDEO_NAME = 'c-drohne-nightlight-3d-v2-20261027.mp4'
checked.POSTER_NAME = 'nightlight-3d-v2-poster-20261027.png'
checked.RECEIPT_NAME = 'NIGHTLIGHT_3D_RENDER_V2.json'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--render-root', type=Path, default=ROOT)
parser.add_argument('--render-source-commit')
args = parser.parse_args()
receipt = checked.encode(args.render_root, args.render_source_commit, repo=REPO,
                         source_root=ROOT, expected_engine='CYCLES',
                         source_git_prefix='tools/nightlight3d_v2/')
print(json.dumps(receipt['video']))
