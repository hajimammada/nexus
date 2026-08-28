import os
import sys
import time
import json
import socket
import shutil
import zipfile
import subprocess
import urllib.request
import urllib.error

WORKSPACE = r"c:\Users\aliye\Projects\AntigravityWorkspace\nexus-dashboard_standard"
RELAY_URL = "https://nexus.hajimammad.com"

results = {
    "round_1_single_tenant_lifecycle": {},
    "round_2_multi_tenant_isolation": {},
    "round_3_satellite_and_fcm_simulation": {},
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

def is_port_open(port, host='127.0.0.1'):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(1.0)
    try:
        s.connect((host, port))
        s.close()
        return True
    except Exception:
        return False

def http_req(url, method="GET", data=None, headers=None, timeout=6):
    if headers is None:
        headers = {}
    if "User-Agent" not in headers:
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Nexus-E2E-Tester"
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

# =========================================================================
# ROUND 1: SINGLE-TENANT FULL APPLICATION LIFECYCLE (PASS 1 & PASS 2)
# =========================================================================
def run_round_1():
    print("\n" + "="*70)
    print("🚀 RUNNING ROUND 1: SINGLE-TENANT APPLICATION LIFECYCLE DEEP TEST")
    print("="*70)

    # 1. Zip package integrity
    zip_path = os.path.join(WORKSPACE, "dist", "download", "nexus-pc-agent.zip")
    if not os.path.exists(zip_path):
        log_test("round_1_single_tenant_lifecycle", "zip_exists", False, "nexus-pc-agent.zip not found in dist")
        return
    with zipfile.ZipFile(zip_path, 'r') as z:
        names = z.namelist()
        has_setup = "Setup.exe" in names
        has_server = "agent/server.js" in names
        has_leaked_pin = any("pairing.json" in n for n in names)
        has_leaked_env = any(".env" in n for n in names)

    log_test("round_1_single_tenant_lifecycle", "zip_structure", 
             has_setup and has_server and not has_leaked_pin and not has_leaked_env,
             f"Files: {len(names)}, Setup.exe: {has_setup}, Clean of pairing.json/env: {not has_leaked_pin and not has_leaked_env}")

    # 2. Clean uninstallation test
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", os.path.join(WORKSPACE, "uninstall.ps1")], capture_output=True)
    time.sleep(2)
    program_data_dir = os.path.expandvars(r"%ProgramData%\NexusAgent")
    pd_deleted = not os.path.exists(program_data_dir)
    port_offline = not is_port_open(48880)
    log_test("round_1_single_tenant_lifecycle", "clean_uninstall", 
             pd_deleted and port_offline, 
             f"ProgramData purged: {pd_deleted}, Port 48880 closed: {port_offline}")

    # 3. Clean fresh installation test
    reg_proc = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", os.path.join(WORKSPACE, "register-task.ps1")], capture_output=True, text=True)
    time.sleep(3)
    
    status, pair_data = http_req("http://localhost:48880/api/pairing")
    pin = pair_data.get("pairCode") if isinstance(pair_data, dict) else ""
    is_valid_pin = pin and len(pin) == 6 and pin.isdigit() and pin != "163860"
    log_test("round_1_single_tenant_lifecycle", "fresh_install_dynamic_pin", 
             is_valid_pin, 
             f"Generated PIN: [{pin}], Is Valid: {is_valid_pin}, Not 163860: {pin != '163860'}")

    # 4. Local telemetry & agent health check
    status, status_data = http_req("http://localhost:48880/api/pairing")
    local_ip = status_data.get("localIp")
    mac = status_data.get("mac")
    agent_key = status_data.get("agentKey")
    log_test("round_1_single_tenant_lifecycle", "local_telemetry_ready", 
             bool(local_ip and mac and agent_key), 
             f"IP: {local_ip}, MAC: {mac}, Key Length: {len(agent_key) if agent_key else 0}")

    # 5. Cloudflare edge pairing claim test
    time.sleep(2) # Give agent 2s to register with cloud
    status, claim_data = http_req(f"{RELAY_URL}/api/pair/claim", method="POST", data={"pairCode": pin})
    claim_ok = status == 200 and isinstance(claim_data, dict) and claim_data.get("success") == True and claim_data.get("pairCode") == pin
    log_test("round_1_single_tenant_lifecycle", "cloudflare_pair_claim", 
             claim_ok, 
             f"Status: {status}, Target MAC matched: {claim_data.get('targetMac') == mac if isinstance(claim_data, dict) else False}")

    # 6. Command dispatch & remote terminal execution
    status, dispatch_res = http_req(f"{RELAY_URL}/api/command/dispatch", method="POST", data={
        "pairCode": pin,
        "action": "TERMINAL",
        "payload": {"command": "Write-Output 'NEXUS_E2E_VERIFIED_OUTPUT'"}
    })
    req_id = dispatch_res.get("reqId") if isinstance(dispatch_res, dict) else None
    
    cmd_output = ""
    for _ in range(10):
        time.sleep(0.8)
        st, res_data = http_req(f"{RELAY_URL}/api/command/result?reqId={req_id}")
        if st == 200 and isinstance(res_data, dict) and res_data.get("success"):
            r = res_data.get("result", {})
            cmd_output = r.get("output", "") if isinstance(r, dict) else str(r)
            if "NEXUS_E2E_VERIFIED_OUTPUT" in cmd_output:
                break
    
    exec_ok = "NEXUS_E2E_VERIFIED_OUTPUT" in cmd_output
    log_test("round_1_single_tenant_lifecycle", "remote_terminal_execution", 
             exec_ok, 
             f"Output: {cmd_output.strip() if cmd_output else 'Timeout/Empty'}")

    # 7. Dynamic PIN reset on live agent
    st_reset, reset_data = http_req("http://localhost:48880/api/pairing/reset", method="POST", data={})
    new_pin = reset_data.get("pairCode") if isinstance(reset_data, dict) else ""
    reset_ok = st_reset == 200 and new_pin and new_pin != pin and len(new_pin) == 6
    log_test("round_1_single_tenant_lifecycle", "dynamic_pin_reset", 
             reset_ok, 
             f"Old PIN: {pin} -> New PIN: {new_pin}")

    # 8. Verify old PIN is dead and new PIN is claimable
    time.sleep(2)
    st_old, _ = http_req(f"{RELAY_URL}/api/pair/claim", method="POST", data={"pairCode": pin})
    st_new, new_claim = http_req(f"{RELAY_URL}/api/pair/claim", method="POST", data={"pairCode": new_pin})
    log_test("round_1_single_tenant_lifecycle", "pin_invalidation_and_relink", 
             st_old == 404 and st_new == 200, 
             f"Old PIN 404: {st_old == 404}, New PIN 200: {st_new == 200}")

    # 9. Rate limiting verification on brute force (Run at end of round)
    brute_blocked = False
    for i in range(18):
        st, _ = http_req(f"{RELAY_URL}/api/pair/claim", method="POST", data={"pairCode": "000000"})
        if st == 429:
            brute_blocked = True
            break
    log_test("round_1_single_tenant_lifecycle", "rate_limit_protection", 
             brute_blocked, 
             f"Rate limit triggered 429 status: {brute_blocked}")

if __name__ == "__main__":
    run_round_1()
