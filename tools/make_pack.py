"""Cloud-side: builds a "video pack" for one timeline.

usage: python3 tools/make_pack.py src/timelines/<file>.json
 1. synthesises public/audio/<id>.wav (audio/build_audio.py)
 2. writes RENDER-<id>.bat (Windows: Node check, npm i only if node_modules is missing, render, open out\\)
 3. zips timeline + wav + bat -> out/packs/<id>-pack.zip
The user extracts the pack INTO their engine folder (replace files) and double-clicks the .bat.
No Python is needed on the user's PC.
"""
import json
import os
import subprocess
import sys
import zipfile

tl_path = sys.argv[1]
# --files a b c : extra engine files (changed code) to ship in the pack, same paths
extra = sys.argv[sys.argv.index('--files') + 1:] if '--files' in sys.argv else []
tl = json.load(open(tl_path))
cid = tl['meta']['id']
audio = tl['meta'].get('audio', f'audio/{cid}.wav')

subprocess.run([sys.executable, 'audio/build_audio.py', tl_path], check=True)

# assets the user's PC is known to have (docs/HANDOFF.md section 3). Anything else that a shipped file
# references is added to the pack automatically, so a render never fails on a missing file.
import re
PC_ASSETS = {'models/man.glb', 'models/Xbot.glb', 'models/car.glb', 'hdr/pedestrian_overpass_1k.hdr', 'hdr/quarry_01_1k.hdr',
             'tex/waternormals.jpg', 'tex/smoke1.png', 'tex/earth_day_4096.jpg', 'tex/earth_clouds_2048.png', 'tex/moon_1024.jpg',
             'tex/kloofendal_48d_partly_cloudy.jpg'}
for f in list(extra):
    if f.endswith(('.ts', '.tsx')):
        for a in set(re.findall(r"(?:hdr|tex|models)/[A-Za-z0-9_./-]+\.(?:hdr|jpg|png|glb)", open(f).read())):
            if a not in PC_ASSETS and os.path.exists('public/' + a) and 'public/' + a not in extra:
                print('pack: adding asset the PC may not have:', a)
                extra.append('public/' + a)

bat = rf"""@echo off
setlocal
cd /d "%~dp0"
title Render {cid}
echo ==== What If engine: rendering {cid} ====

where node >nul 2>nul || (echo [X] Node.js not found. Install the LTS version from https://nodejs.org and run this again. & pause & exit /b 1)

if not exist node_modules (
  echo [1/2] Installing packages, first time only...
  call npm i || goto :fail
) else echo [1/2] Packages already installed.

echo [2/2] Rendering video...
if not exist out mkdir out
call npx remotion render src/index.ts {cid} out\{cid}.mp4 --gl=angle %* || goto :fail

echo.
echo DONE: out\{cid}.mp4
start "" "%~dp0out"
pause
exit /b 0

:fail
echo.
echo [X] Something failed. Copy the error above and send it to Claude.
pause
exit /b 1
"""
bat_name = f'RENDER-{cid}.bat'
open(bat_name, 'w', newline='\r\n').write(bat)

os.makedirs('out/packs', exist_ok=True)
dst = f'out/packs/{cid}-pack.zip'
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as z:
    z.write(tl_path, tl_path.replace('\\', '/'))
    z.write(os.path.join('public', audio), 'public/' + audio)
    z.write(bat_name, bat_name)
    for f in extra:
        z.write(f, f.replace('\\', '/'))
os.remove(bat_name)  # the .bat lives only in the pack
print('pack:', dst, f'{os.path.getsize(dst) / 1e6:.1f} MB')
