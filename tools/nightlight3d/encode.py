from pathlib import Path
import subprocess,json,hashlib,shutil,struct,argparse
r=Path(__file__).parent;repo=r.parents[1];assets=repo/'dist/assets'
parser=argparse.ArgumentParser();parser.add_argument('--render-root',type=Path,default=r)
render_root=parser.parse_args().render_root;frames=render_root/'frames-final'
files=[frames/f'frame-{i:04d}.png' for i in range(1,601)]
digests=[]
for f in files:
    data=f.read_bytes()
    if data[:8]!=b'\x89PNG\r\n\x1a\n' or struct.unpack('>II',data[16:24])!=(1920,1080):raise ValueError('Invalid frame: '+f.name)
    digests.append(hashlib.sha256(data).hexdigest())
video=assets/'c-drohne-nightlight-3d-20261027.mp4'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate','30','-start_number','1','-i',str(frames/'frame-%04d.png'),'-frames:v','600','-an','-c:v','libx264','-preset','medium','-crf','22','-maxrate','2500k','-bufsize','5000k','-pix_fmt','yuv420p','-movflags','+faststart',str(video)],check=True)
shutil.copyfile(files[269],assets/'nightlight-3d-poster-20261027.png')
info=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_entries','stream=codec_name,codec_type,width,height,r_frame_rate,nb_read_frames:format=duration,size','-of','json',str(video)],encoding='utf-8'))
assert len(info['streams'])==1
s=info['streams'][0]
assert (s['width'],s['height'],s['r_frame_rate'],s['nb_read_frames'])==(1920,1080,'30/1','600')
assert abs(float(info['format']['duration'])-20)<.05 and video.stat().st_size<10*1024*1024
receipt={'schema':'NIGHTLIGHT_3D_MEDIA_V1','engine':'Blender5.2.3 EEVEE','geometry':'Authored3D mesh scene; moving drone, camera, gimbal light, rotor meshes and small head-bone animation.','source':'tools/nightlight3d/','render':json.loads((render_root/'RENDER_RECEIPT.json').read_text(encoding='utf-8')),'frames':{'count':600,'orderedSha256ListDigest':hashlib.sha256('\n'.join(digests).encode('ascii')).hexdigest()},'video':{'path':video.name,'sha256':hashlib.sha256(video.read_bytes()).hexdigest(),'probe':info},'claimCeiling':'Rendered concept animation; not real flight, sensor recognition, autonomous decisions or accepted film-quality proof.'}
(repo/'NIGHTLIGHT_3D_RENDER.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8');print(json.dumps(receipt['video']))
