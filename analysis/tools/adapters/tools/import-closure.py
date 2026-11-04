# Static closure of relative imports of an ESM file inside mootant's dist.
import os, re, sys
entry = os.path.abspath(sys.argv[1]); root = os.path.abspath(sys.argv[2])
pattern = re.compile(r"""(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"](\.{1,2}/[^'"]+)['"]""")
seen, stack = set(), [entry]
while stack:
    file = stack.pop()
    if file in seen or not os.path.exists(file):
        continue
    seen.add(file)
    text = open(file, encoding='utf8').read()
    for spec in pattern.findall(text):
        target = os.path.normpath(os.path.join(os.path.dirname(file), spec))
        if not target.endswith('.js') and os.path.exists(target + '.js'):
            target += '.js'
        stack.append(target)
for file in sorted(os.path.relpath(f, root) for f in seen):
    print(file)
