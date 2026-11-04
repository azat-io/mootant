# Lists, per process of a NODE_V8_COVERAGE directory, the mootant dist modules
# in which at least one named function ran, grouped by folder.
import json, os, sys, collections
directory = sys.argv[1]
marker = '/node_modules/mootant/dist/'
for name in sorted(os.listdir(directory)):
    data = json.load(open(os.path.join(directory, name)))
    modules = {}
    for script in data['result']:
        url = script['url']
        at = url.find(marker)
        if at == -1:
            continue
        file = url[at + len(marker):]
        ran = sorted({f['functionName'] for f in script['functions'] if f['functionName'] and f['ranges'][0]['count'] > 0})
        if ran:
            modules[file] = ran
    if not modules:
        continue
    groups = collections.defaultdict(list)
    for file in sorted(modules):
        parts = file.split('/')
        folder = '/'.join(parts[:2]) if parts[0] in ('core', 'adapters', 'cli') and len(parts) > 2 else parts[0]
        groups[folder].append(file)
    print('##', name, 'modules-with-calls:', len(modules))
    for folder in sorted(groups):
        print('  %-24s %3d  %s' % (folder, len(groups[folder]), ' '.join(f.split('/')[-1].replace('.js', '') for f in groups[folder])))
