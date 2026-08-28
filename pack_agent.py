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

# Compile Setup.exe from C# source
print("Compiling native Setup.exe wizard...")
wpf_dir = r"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\WPF"
csc_exe = r"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if os.path.exists(csc_exe) and os.path.exists(os.path.join(root_dir, "installer", "Installer.cs")):
    import subprocess
    cmd = [
        csc_exe,
        "/target:winexe",
        f"/out:{os.path.join(root_dir, 'Setup.exe')}",
        f"/r:{wpf_dir}\\PresentationCore.dll",
        f"/r:{wpf_dir}\\PresentationFramework.dll",
        f"/r:{wpf_dir}\\WindowsBase.dll",
        "/r:System.dll",
        "/r:System.Core.dll",
        "/r:System.Xaml.dll",
        os.path.join(root_dir, "installer", "Installer.cs")
    ]
    subprocess.run(cmd, check=True)

print("Packaging nexus-pc-agent.zip from latest source files...")
with zipfile.ZipFile(pc_zip_pub, "w", zipfile.ZIP_DEFLATED) as z:
    for f in ["Setup.exe", "install.bat", "register-task.ps1", "uninstall.bat", "uninstall.ps1", "reset-pin.bat", "reset-pin.ps1", "README.md"]:
        p = os.path.join(root_dir, f)
        if os.path.exists(p):
            z.write(p, f)
    agent_dir = os.path.join(root_dir, "agent")
    for root, dirs, files in os.walk(agent_dir):
        if "node_modules" in dirs:
            dirs.remove("node_modules")
        for f in files:
            if f.endswith((".log", ".env", "pairing.json")):
                continue
            full = os.path.join(root, f)
            rel = os.path.relpath(full, root_dir)
            z.write(full, rel)

shutil.copyfile(pc_zip_pub, pc_zip_dist)

# Sync latest compiled APK to public and dist downloads
apk_built = os.path.join(root_dir, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk")
if os.path.exists(apk_built):
    shutil.copyfile(apk_built, os.path.join(pub_dl, "nexus-satellite.apk"))
    shutil.copyfile(apk_built, os.path.join(dist_dl, "nexus-satellite.apk"))
    print(f"✓ Synced latest APK to client/public and dist download targets ({os.path.getsize(apk_built)} bytes)")

# Verify
with zipfile.ZipFile(pc_zip_dist, "r") as z:
    for name in z.namelist():
        if "server.js" in name:
            content = z.read(name).decode("utf-8")
            print(f"Verified: {name} (Size: {len(content)} bytes, Has getSessionInfo: {'getSessionInfo' in content})")

print("Successfully packaged nexus-pc-agent.zip!")
