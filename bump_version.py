import json
import re
import sys
import os

root_dir = os.path.abspath(os.path.dirname(__file__))

# Determine version
if len(sys.argv) > 1:
    NEW_VERSION = sys.argv[1].lstrip("v")
else:
    with open(os.path.join(root_dir, "package.json"), "r", encoding="utf-8") as f:
        curr = json.load(f).get("version", "3.7.7")
    parts = curr.split(".")
    parts[-1] = str(int(parts[-1]) + 1)
    NEW_VERSION = ".".join(parts)

parts = NEW_VERSION.split(".")
NEW_CODE = int(parts[0]) * 100 + int(parts[1]) * 10 + int(parts[2])

print(f"Bumping project version to v{NEW_VERSION} (code: {NEW_CODE})...")

# 1. package.json files
for rel in ["package.json", "client/package.json", "agent/package.json", "satellite/package.json"]:
    p = os.path.join(root_dir, rel)
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            d = json.load(f)
        d["version"] = NEW_VERSION
        with open(p, "w", encoding="utf-8") as f:
            json.dump(d, f, indent=2)
        print(f"✓ Updated {rel} -> {NEW_VERSION}")

# 2. client/src/App.jsx
app_jsx = os.path.join(root_dir, "client", "src", "App.jsx")
if os.path.exists(app_jsx):
    with open(app_jsx, "r", encoding="utf-8") as f:
        content = f.read()
    content = re.sub(r"const APP_VERSION = 'v[0-9\.]+';", f"const APP_VERSION = 'v{NEW_VERSION}';", content)
    with open(app_jsx, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"✓ Updated client/src/App.jsx -> v{NEW_VERSION}")

# 3. agent/server.js
server_js = os.path.join(root_dir, "agent", "server.js")
if os.path.exists(server_js):
    with open(server_js, "r", encoding="utf-8") as f:
        content = f.read()
    content = re.sub(r"version: '[0-9\.]+'", f"version: '{NEW_VERSION}'", content)
    with open(server_js, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"✓ Updated agent/server.js -> {NEW_VERSION}")

# 4. android/app/build.gradle
gradle = os.path.join(root_dir, "android", "app", "build.gradle")
if os.path.exists(gradle):
    with open(gradle, "r", encoding="utf-8") as f:
        content = f.read()
    content = re.sub(r"versionCode \d+", f"versionCode {NEW_CODE}", content)
    content = re.sub(r'versionName "[0-9\.]+"', f'versionName "{NEW_VERSION}"', content)
    with open(gradle, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"✓ Updated android/app/build.gradle -> {NEW_VERSION} ({NEW_CODE})")

# 5. installer/Installer.cs
installer_cs = os.path.join(root_dir, "installer", "Installer.cs")
if os.path.exists(installer_cs):
    with open(installer_cs, "r", encoding="utf-8") as f:
        content = f.read()
    content = re.sub(r'Nexus v[0-9\.]+ Native', f'Nexus v{NEW_VERSION} Native', content)
    with open(installer_cs, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"✓ Updated installer/Installer.cs -> Nexus v{NEW_VERSION} Native")

print(f"\n🎉 Successfully bumped entire project to v{NEW_VERSION}!")
