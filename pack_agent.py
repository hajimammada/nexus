import zipfile
import os
import shutil

root_dir = os.path.abspath(os.path.dirname(__file__))
pub_dl = os.path.join(root_dir, "client", "public", "download")
dist_dl = os.path.join(root_dir, "dist", "download")
os.makedirs(pub_dl, exist_ok=True)
os.makedirs(dist_dl, exist_ok=True)

pc_zip_pub = os.path.join(pub_dl, "nexus-pc-agent.zip")
pc_zip_dist = os.path.join(dist_dl, "nexus-pc-agent.zip")

print("Packaging nexus-pc-agent.zip from latest source files...")
with zipfile.ZipFile(pc_zip_pub, "w", zipfile.ZIP_DEFLATED) as z:
    for f in ["Setup.exe", "install.bat", "register-task.ps1", "README.md"]:
        p = os.path.join(root_dir, f)
        if os.path.exists(p):
            z.write(p, f)
    agent_dir = os.path.join(root_dir, "agent")
    for root, dirs, files in os.walk(agent_dir):
        if "node_modules" in dirs:
            dirs.remove("node_modules")
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, root_dir)
            z.write(full, rel)

shutil.copyfile(pc_zip_pub, pc_zip_dist)

# Verify
with zipfile.ZipFile(pc_zip_dist, "r") as z:
    for name in z.namelist():
        if "server.js" in name:
            content = z.read(name).decode("utf-8")
            print(f"Verified: {name} (Size: {len(content)} bytes, Has getSessionInfo: {'getSessionInfo' in content})")

print("Successfully packaged nexus-pc-agent.zip!")
