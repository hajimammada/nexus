import os
import sys
import time
import json
import socket
import urllib.request
import urllib.error

WORKSPACE = r"c:\Users\aliye\Projects\AntigravityWorkspace\nexus-dashboard_standard"
RELAY_URL = "https://nexus.hajimammad.com"

results = {
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

def http_req(url, method="GET", data=None, headers=None, timeout=6):
    if headers is None:
        headers = {}
    if "User-Agent" not in headers:
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Nexus-Satellite-Sim"
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

def run_round_3():
    print("\n" + "="*70)
    print("📱 RUNNING ROUND 3: ANDROID SATELLITE RELAY & FCM PUSH SIMULATION")
    print("="*70)

    # 1. Register a virtual PC node
    test_pin = "778899"
    test_room = f"room_{test_pin}_pc"
    test_token = f"token_{test_pin}"

    st_reg, reg_data = http_req(f"{RELAY_URL}/api/pair/register", method="POST", data={
        "pairCode": test_pin,
        "roomId": test_room,
        "token": test_token,
        "mac": "AA:BB:CC:DD:EE:FF",
        "localIp": "192.168.1.99",
        "hostname": "Satellite-Host-PC",
        "agentKey": "mock_key_sat"
    })
    log_test("round_3_satellite_and_fcm_simulation", "satellite_target_registration", 
             st_reg == 200 and isinstance(reg_data, dict) and reg_data.get("success"), 
             f"Registered Room: {test_room}, Status: {st_reg}")

    # 2. Simulated Android App claims PIN
    st_claim, claim_data = http_req(f"{RELAY_URL}/api/pair/claim", method="POST", data={"pairCode": test_pin})
    app_linked = st_claim == 200 and claim_data.get("targetMac") == "AA:BB:CC:DD:EE:FF"
    log_test("round_3_satellite_and_fcm_simulation", "android_app_pin_claim", 
             app_linked, 
             f"Android Phone successfully resolved target MAC AA:BB:CC:DD:EE:FF and IP 192.168.1.99")

    # 3. Dispatch Wake-on-LAN command from Dashboard to Satellite
    st_wol, wol_res = http_req(f"{RELAY_URL}/api/command/dispatch", method="POST", data={
        "pairCode": test_pin,
        "action": "WOL",
        "subAction": "wake",
        "payload": {"mac": "AA:BB:CC:DD:EE:FF"}
    })
    req_id = wol_res.get("reqId") if isinstance(wol_res, dict) else None
    log_test("round_3_satellite_and_fcm_simulation", "fcm_wol_dispatch", 
             st_wol == 200 and req_id is not None, 
             f"FCM Push queued for topic [nexus_{test_pin}], reqId: {req_id}")

    # 4. Android Satellite HTTP Polling Fallback (when phone is in sleep/doze mode)
    st_poll, poll_data = http_req(f"{RELAY_URL}/api/command/pending?code={test_pin}")
    cmds = poll_data.get("commands", []) if isinstance(poll_data, dict) else []
    
    received_wol = any(c.get("action") == "WOL" and c.get("reqId") == req_id for c in cmds)
    log_test("round_3_satellite_and_fcm_simulation", "satellite_command_retrieval", 
             received_wol, 
             f"Pending queue delivered WOL packet to Satellite phone: {received_wol}")

    # 5. Android Satellite posts execution confirmation back to Cloud
    st_post_res, _ = http_req(f"{RELAY_URL}/api/command/result", method="POST", data={
        "reqId": req_id,
        "pairCode": test_pin,
        "success": True,
        "message": "Magic packet (WOL) broadcasted across local LAN via UDP 9"
    })
    log_test("round_3_satellite_and_fcm_simulation", "satellite_result_postback", 
             st_post_res == 200, 
             f"Result acknowledgement received by Cloud Relay: Status {st_post_res}")

    # 6. Dashboard retrieves execution confirmation
    st_check, check_data = http_req(f"{RELAY_URL}/api/command/result?reqId={req_id}")
    dash_ack = st_check == 200 and isinstance(check_data, dict) and check_data.get("isSuccess") == True
    log_test("round_3_satellite_and_fcm_simulation", "dashboard_ack_flow", 
             dash_ack, 
             f"Dashboard confirmed WOL execution: {check_data.get('message') if isinstance(check_data, dict) else ''}")

if __name__ == "__main__":
    run_round_3()
