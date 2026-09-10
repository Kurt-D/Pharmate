import json
import re
import subprocess
from pathlib import Path

session = Path(r'C:\Users\qcaro\.codex\sessions\2026\09\08\rollout-2026-09-08T20-50-23-01a08111-d180-7b90-ad0b-a81d16def0f7.jsonl')
matches = []
patch_calls = []

def visit(value):
    if isinstance(value, dict):
        for item in value.values():
            visit(item)
    elif isinstance(value, list):
        for item in value:
            visit(item)
    elif isinstance(value, str) and 'diff --git a/client/src/pages/patient/ProfileRedesign.jsx' in value:
        matches.append(value)

for line in session.open(encoding='utf-8'):
    try:
        entry = json.loads(line)
        visit(entry)
        payload = entry.get('payload', {})
        raw = payload.get('input', '') if isinstance(payload, dict) else ''
        if payload.get('name') == 'exec' and 'const patch = ' in raw and any(
            name in raw for name in ('AnchorOnboarding.jsx', 'SignupRedesign.jsx', 'ProfileRedesign.jsx', 'profile-page.css')
        ):
            patch_calls.append((entry.get('timestamp'), raw))
    except json.JSONDecodeError:
        pass

for index, value in enumerate(sorted(matches, key=len, reverse=True)[:10]):
    print(index, len(value), value.count('diff --git'), 'GUIDED_HEALTH_OPTIONS' in value)
    Path(f'session_diff_{index}.txt').write_text(value, encoding='utf-8')

for index, (timestamp, raw) in enumerate(patch_calls):
    print('PATCH', index, timestamp, len(raw),
          'Anchor' if 'AnchorOnboarding.jsx' in raw else '',
          'Signup' if 'SignupRedesign.jsx' in raw else '',
          'Profile' if 'ProfileRedesign.jsx' in raw else '',
          'CSS' if 'profile-page.css' in raw else '',
          'GUIDED' if 'GUIDED_HEALTH_OPTIONS' in raw else '')
    Path(f'session_patch_call_{index}.txt').write_text(raw, encoding='utf-8')
    match = re.search(r'const patch = ("(?:\\.|[^"\\])*");', raw, re.S)
    if match:
        Path(f'session_patch_{index}.patch').write_text(json.loads(match.group(1)), encoding='utf-8')

if '--apply' in __import__('sys').argv:
    patcher = r'C:\Users\qcaro\AppData\Local\OpenAI\Codex\bin\8e5b6932251c2c1c\codex.exe'
    for index in range(14):
        content = Path(f'session_patch_{index}.patch').read_text(encoding='utf-8')
        chunks = re.findall(r'(\*\*\* Update File: .*?)(?=\n\*\*\* (?:Update|Add|Delete) File:|\n\*\*\* End Patch)', content, re.S)
        for chunk_index, chunk in enumerate(chunks):
            first = chunk.splitlines()[0]
            if 'client/src/' not in first:
                continue
            one_patch = f'*** Begin Patch\n{chunk}\n*** End Patch'
            result = subprocess.run([patcher, '--codex-run-as-apply-patch', one_patch], text=True, capture_output=True)
            print(f'{index}.{chunk_index}', result.returncode, result.stdout.strip() or result.stderr.strip())
