import os
import sys
import time
import json

WORKSPACE = r"c:\Users\aliye\Projects\AntigravityWorkspace\nexus-dashboard_standard"
sys.path.insert(0, os.path.join(WORKSPACE, "tests", "lifecycle"))

import test_round_1
import test_round_2
import test_round_3

def main():
    print("=======================================================================")
    print("🧪 NEXUS MULTIPLATFORM FULL LIFECYCLE DEEP TEST MATRIX (2-PASS AUDIT)")
    print("=======================================================================")
    print(f"Time: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Target Relay: https://nexus.hajimammad.com")
    print(f"Target PC Architecture: Windows 64-bit Native C# + Node.js Daemon")
    print("=======================================================================\n")

    start_time = time.time()

    # Pass 1
    print(">>> EXECUTING PASS 1 OF 2 <<<\n")
    test_round_1.run_round_1()
    test_round_2.run_round_2()
    test_round_3.run_round_3()

    print("\n" + "#"*70)
    print(">>> EXECUTING PASS 2 OF 2 (REPEAT TO PROVE IDEMPOTENCY & STABILITY) <<<")
    print("#"*70 + "\n")

    test_round_1.run_round_1()
    test_round_2.run_round_2()
    test_round_3.run_round_3()

    # Restore the actual machine agent cleanly
    print("\n" + "="*70)
    print("🔄 RESTORING LIVE LOCAL AGENT ON HOST PC...")
    print("="*70)
    import subprocess
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", os.path.join(WORKSPACE, "register-task.ps1")], capture_output=True)
    time.sleep(3)

    duration = round(time.time() - start_time, 2)
    print(f"\n=======================================================================")
    print(f"🎉 ALL 2-PASS AUDIT TESTS COMPLETED IN {duration}s!")
    print("=======================================================================")

if __name__ == "__main__":
    main()
