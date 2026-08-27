import json
import re
import os

NEW_VERSION = "3.7.7"
NEW_CODE = 377

# 1. package.json
for p in ["package.json", "client/package.json", "agent/package.json", "satellite/package.json"]:
    with open(p, "r", encoding="utf-8") as f:
        d = json.load(f)
    d["version"] = NEW_VERSION
    with open(p, "w", encoding="utf-8") as f:
        json.dump(d, f, indent=2)
    print(f"Updated {p} -> {NEW_VERSION}")

# 2. client/src/App.jsx
app_jsx = "client/src/App.jsx"
with open(app_jsx, "r", encoding="utf-8") as f:
    content = f.read()
content = re.sub(r"const APP_VERSION = 'v[0-9\.]+';", f"const APP_VERSION = 'v{NEW_VERSION}';", content)
with open(app_jsx, "w", encoding="utf-8") as f:
    f.write(content)
print(f"Updated {app_jsx} -> v{NEW_VERSION}")

# 3. agent/server.js
server_js = "agent/server.js"
with open(server_js, "r", encoding="utf-8") as f:
    content = f.read()
content = re.sub(r"version: '[0-9\.]+'", f"version: '{NEW_VERSION}'", content)
with open(server_js, "w", encoding="utf-8") as f:
    f.write(content)
print(f"Updated {server_js} -> {NEW_VERSION}")

# 4. android/app/build.gradle
gradle = "android/app/build.gradle"
with open(gradle, "r", encoding="utf-8") as f:
    content = f.read()
content = re.sub(r"versionCode \d+", f"versionCode {NEW_CODE}", content)
content = re.sub(r'versionName "[0-9\.]+"', f'versionName "{NEW_VERSION}"', content)
with open(gradle, "w", encoding="utf-8") as f:
    f.write(content)
print(f"Updated {gradle} -> {NEW_VERSION} ({NEW_CODE})")

# 5. installer/Installer.cs
installer_cs = "installer/Installer.cs"
with open(installer_cs, "r", encoding="utf-8") as f:
    content = f.read()
content = re.sub(r'Nexus v[0-9\.]+ Native', f'Nexus v{NEW_VERSION} Native', content)
with open(installer_cs, "w", encoding="utf-8") as f:
    f.write(content)
print(f"Updated {installer_cs} -> Nexus v{NEW_VERSION} Native")

print(f"\n🎉 Successfully bumped entire project to v{NEW_VERSION}!")
