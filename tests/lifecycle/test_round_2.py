import os
import sys
import time
import json
import socket
import shutil
import subprocess
import urllib.request
import urllib.error

WORKSPACE = r"c:\Users\aliye\Projects\AntigravityWorkspace\nexus-dashboard_standard"
RELAY_URL = "https://nexus.hajimammad.com"

results = {
    "round_2_multi_tenant_isolation": {},
    "summary": {"passed": 0, "failed": 0, "total": 0}
}

def log_test(module, test_name, status, detail=""):
    print(f"[{module.upper()}] {'✓' if status else '✗'} {test_name} - {detail}")
    results[module][test_name] = {"status": "PASSED" if status else "FAILED", "detail": detail}
    results["summary"]["total"] += 1
    if status:
        results["summary"]["passed"] += 1
    else:
        results["summary"]["failed"] += 1

def http_req(url, method="GET", data=None, headers=None, timeout=6):
    if headers is None:
        headers = {}
    if "User-Agent" not in headers:
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Nexus-MultiTenant-Tester"
    if data is not None and isinstance(data, (dict, list)):
        data = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            try:
                return resp.status, json.loads(body)
            except:
                return resp.status, body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except:
            return e.code, body
    except Exception as e:
        return 0, str(e)

def setup_simulated_node(node_name, port):
    node_dir = os.path.join(WORKSPACE, "tests", "lifecycle", "mock_nodes", node_name)
    if os.path.exists(node_dir):
        shutil.rmtree(node_dir, ignore_errors=True)
    os.makedirs(node_dir, exist_ok=True)

    # Copy agent source
    agent_src = os.path.join(WORKSPACE, "agent")
    for item in os.listdir(agent_src):
        if item in ["node_modules", "agent_activity.log", "pairing.json", ".env"]:
            continue
        s = os.path.join(agent_src, item)
        d = os.path.join(node_dir, item)
        if os.path.isfile(s):
            shutil.copy2(s, d)

    # Write node-specific .env
    env_content = f"PORT={port}\nRELAY_URL={RELAY_URL}\nAGENT_KEY=key_{node_name}\n"
    with open(os.path.join(node_dir, ".env"), "w", encoding="utf-8") as f:
        f.write(env_content)

    # Start Node process with parent node_modules
    server_js = os.path.join(node_dir, "server.js")
    node_env = os.environ.copy()
    node_env["NODE_PATH"] = os.path.join(WORKSPACE, "agent", "node_modules")
    proc = subprocess.Popen(["node", server_js], cwd=node_dir, env=node_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return node_dir, proc

def run_round_2():
    print("\n" + "="*70)
    print("🌐 RUNNING ROUND 2: MULTI-TENANT 2-COMPUTER ISOLATION & CONCURRENCY TEST")
    print("="*70)

    # 1. Spin up PC-Alpha (Port 49001) and PC-Beta (Port 49002)
    dir_alpha, proc_alpha = setup_simulated_node("PC_Alpha", 49001)
    dir_beta, proc_beta = setup_simulated_node("PC_Beta", 49002)

    try:
        time.sleep(3)

        # 2. Query both nodes for dynamic PINs
        st_a, data_a = http_req("http://localhost:49001/api/pairing")
        st_b, data_b = http_req("http://localhost:49002/api/pairing")

        pin_a = data_a.get("pairCode") if isinstance(data_a, dict) else ""
        pin_b = data_b.get("pairCode") if isinstance(data_b, dict) else ""

        distinct_pins = pin_a and pin_b and pin_a != pin_b and len(pin_a) == 6 and len(pin_b) == 6
        log_test("round_2_multi_tenant_isolation", "concurrent_spinup_unique_pins", 
                 distinct_pins, 
                 f"Alpha PIN: [{pin_a}], Beta PIN: [{pin_b}], Different: {pin_a != pin_b}")

        # 3. Verify Cloudflare Edge Routing to Distinct Machines
        time.sleep(2)
        st_claim_a, claim_a = http_req(f"{RELAY_URL}/api/pair/claim", method="POST", data={"pairCode": pin_a})
        st_claim_b, claim_b = http_req(f"{RELAY_URL}/api/pair/claim", method="POST", data={"pairCode": pin_b})

        room_a = claim_a.get("roomId") if isinstance(claim_a, dict) else ""
        room_b = claim_b.get("roomId") if isinstance(claim_b, dict) else ""

        isolated_rooms = room_a and room_b and room_a != room_b
        log_test("round_2_multi_tenant_isolation", "cloud_routing_isolation", 
                 isolated_rooms, 
                 f"Room Alpha: {room_a} vs Room Beta: {room_b}")

        # 4. Targeted Execution & Cross-Talk Prevention Test
        # Dispatch command to Alpha
        st_d_a, res_d_a = http_req(f"{RELAY_URL}/api/command/dispatch", method="POST", data={
            "pairCode": pin_a,
            "action": "TERMINAL",
            "payload": {"command": "Write-Output 'ALPHA_SECRET_EXECUTION_STRING'"}
        })
        req_id_a = res_d_a.get("reqId") if isinstance(res_d_a, dict) else None

        # Dispatch command to Beta
        st_d_b, res_d_b = http_req(f"{RELAY_URL}/api/command/dispatch", method="POST", data={
            "pairCode": pin_b,
            "action": "TERMINAL",
            "payload": {"command": "Write-Output 'BETA_SECRET_EXECUTION_STRING'"}
        })
        req_id_b = res_d_b.get("reqId") if isinstance(res_d_b, dict) else None

        # Poll results
        out_a, out_b = "", ""
        for _ in range(12):
            time.sleep(0.8)
            if not out_a:
                _, r_a = http_req(f"{RELAY_URL}/api/command/result?reqId={req_id_a}")
                if isinstance(r_a, dict) and r_a.get("success"):
                    out_a = str(r_a.get("result", {}).get("output", ""))
            if not out_b:
                _, r_b = http_req(f"{RELAY_URL}/api/command/result?reqId={req_id_b}")
                if isinstance(r_b, dict) and r_b.get("success"):
                    out_b = str(r_b.get("result", {}).get("output", ""))
            if out_a and out_b:
                break

        alpha_correct = "ALPHA_SECRET_EXECUTION_STRING" in out_a
        beta_correct = "BETA_SECRET_EXECUTION_STRING" in out_b
        log_test("round_2_multi_tenant_isolation", "targeted_command_delivery", 
                 alpha_correct and beta_correct, 
                 f"Alpha executed Alpha cmd: {alpha_correct}, Beta executed Beta cmd: {beta_correct}")

        # Check logs on Alpha to make sure it NEVER saw Beta's command
        log_file_a = os.path.join(dir_alpha, "agent_activity.log")
        log_file_b = os.path.join(dir_beta, "agent_activity.log")
        
        cross_talk = False
        if os.path.exists(log_file_a):
            with open(log_file_a, "r", errors="ignore") as f:
                if "BETA_SECRET" in f.read(): cross_talk = True
        if os.path.exists(log_file_b):
            with open(log_file_b, "r", errors="ignore") as f:
                if "ALPHA_SECRET" in f.read(): cross_talk = True

        log_test("round_2_multi_tenant_isolation", "zero_crosstalk_guarantee", 
                 not cross_talk, 
                 f"Zero cross-talk between Machine A and Machine B: {not cross_talk}")

        # 5. Independent PIN Reset
        st_ra, res_ra = http_req("http://localhost:49001/api/pairing/reset", method="POST", data={})
        new_pin_a = res_ra.get("pairCode") if isinstance(res_ra, dict) else ""

        # Verify Beta PIN is completely unaffected
        st_check_b, data_check_b = http_req("http://localhost:49002/api/pairing")
        pin_b_after = data_check_b.get("pairCode") if isinstance(data_check_b, dict) else ""

        log_test("round_2_multi_tenant_isolation", "independent_reset_resilience", 
                 new_pin_a != pin_a and pin_b_after == pin_b, 
                 f"Alpha PIN updated: {pin_a} -> {new_pin_a}, Beta PIN stayed constant: {pin_b_after}")

    finally:
        # Cleanup mock processes
        proc_alpha.terminate()
        proc_beta.terminate()
        time.sleep(1)
        shutil.rmtree(os.path.join(WORKSPACE, "tests", "lifecycle", "mock_nodes"), ignore_errors=True)

if __name__ == "__main__":
    run_round_2()
