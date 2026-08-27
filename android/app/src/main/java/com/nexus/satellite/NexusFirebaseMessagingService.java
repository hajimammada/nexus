package com.nexus.satellite;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

public class NexusFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "NexusFCMService";
    private static final String RELAY_URL = "https://nexus.hajimammad.com";

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        Log.i(TAG, "New FCM Registration Token: " + token);
        sendLog("🔥 Registered with Google FCM: " + token.substring(0, Math.min(10, token.length())) + "...");
        subscribeToCurrentTopic(this);
    }

    public static void subscribeToCurrentTopic(Context context) {
        try {
            if (context == null) return;
            SharedPreferences prefs = context.getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE);
            String pin = prefs.getString("currentPin", "");
            if (pin == null || pin.isEmpty()) {
                String roomId = prefs.getString("roomId", "");
                if (roomId != null && roomId.contains("_")) {
                    String[] parts = roomId.split("_");
                    if (parts.length > 1) pin = parts[1];
                }
            }
            if (pin != null && !pin.isEmpty()) {
                FirebaseMessaging.getInstance().subscribeToTopic("nexus_" + pin);
                Log.i(TAG, "Subscribed to private FCM topic: nexus_" + pin);
            }
        } catch (Exception e) {
            Log.w(TAG, "Error subscribing to FCM topic: " + e.getMessage());
        }
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        Log.i(TAG, "🔥 HIGH-PRIORITY FCM PUSH RECEIVED: " + data);

        if (data.isEmpty()) return;

        final String action = (data.get("action") != null ? data.get("action") : "").toUpperCase();
        final String subAction = (data.get("subAction") != null ? data.get("subAction") : "").toLowerCase();
        final String reqId = data.get("reqId") != null ? data.get("reqId") : String.valueOf(System.currentTimeMillis());
        final String payloadStr = data.get("payload");

        sendLog("⚡ FCM PUSH: " + action + (subAction.isEmpty() ? "" : (" (" + subAction + ")")));

        new Thread(new Runnable() {
            @Override
            public void run() {
                executeFcmCommand(action, subAction, reqId, payloadStr);
            }
        }).start();
    }

    private void executeFcmCommand(String action, String subAction, String reqId, String payloadStr) {
        SharedPreferences prefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE);
        boolean paired = prefs.getBoolean("paired", false);
        String pairCode = prefs.getString("currentPin", "");
        if (pairCode.isEmpty()) {
            String roomId = prefs.getString("roomId", "");
            if (roomId.contains("_")) {
                String[] parts = roomId.split("_");
                if (parts.length > 1) pairCode = parts[1];
            }
        }
        String currentIp = prefs.getString("targetIp", "");
        String currentMac = prefs.getString("targetMac", "");
        String agentKey = prefs.getString("agentKey", "");

        if (!paired || currentIp.isEmpty()) {
            sendLog("⚠️ Command ignored: Phone is not paired with any active PC.");
            return;
        }

        boolean success = false;
        String message = "";
        String resultPayload = "";

        Log.i(TAG, "⚡ EXECUTING FCM ACTION: " + action + " -> Target IP: " + currentIp);

        if ("WAKE".equals(action) || "TURN ON".equals(action)) {
            sendLog("📡 Broadcasting WOL Magic Packet on Wi-Fi...");
            success = WolManager.sendWakeOnLan(this, currentMac);
            message = success ? "Wake-on-LAN magic packet broadcasted on Wi-Fi" : "Failed to broadcast WOL packet";
            sendLog(success ? "✅ WOL Packet Broadcasted!" : "❌ Failed to send WOL");
        } else if ("UNLOCK".equals(action)) {
            sendLog("🔑 Sending Authenticated Unlock to " + currentIp + ":48880...");
            success = SshUnlockManager.triggerUnlock(currentIp, 22, agentKey);
            message = success ? "Unlock signal dispatched to PC" : "Could not reach PC unlock endpoint";
            sendLog(success ? "✅ Unlock Dispatched (HTTP 200)!" : "❌ Unlock Failed");
        } else if ("TERMINAL".equals(action)) {
            try {
                JSONObject payload = payloadStr != null ? new JSONObject(payloadStr) : new JSONObject();
                String cmd = payload.optString("command", "");
                String cwd = payload.optString("cwd", "");

                sendLog("💻 Executing Terminal: " + cmd);
                URL u = new URL("http://" + currentIp + ":48880/api/terminal/exec");
                HttpURLConnection conn = (HttpURLConnection) u.openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(6000);
                conn.setReadTimeout(12000);
                conn.setRequestProperty("Content-Type", "application/json");
                if (agentKey != null && !agentKey.isEmpty()) {
                    conn.setRequestProperty("Authorization", "Bearer " + agentKey);
                    conn.setRequestProperty("x-agent-key", agentKey);
                }
                conn.setDoOutput(true);
                JSONObject termReq = new JSONObject();
                termReq.put("command", cmd);
                if (!cwd.isEmpty()) termReq.put("cwd", cwd);

                OutputStream os = conn.getOutputStream();
                os.write(termReq.toString().getBytes("UTF-8"));
                os.close();

                int code = conn.getResponseCode();
                if (code == 200) {
                    BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = br.readLine()) != null) sb.append(line).append("\n");
                    br.close();
                    resultPayload = sb.toString();
                    success = true;
                    message = "Command executed.";
                    sendLog("✅ Terminal HTTP 200 OK");
                } else {
                    message = "Terminal returned HTTP " + code;
                    sendLog("❌ Terminal HTTP " + code);
                }
                conn.disconnect();
            } catch (Exception e) {
                message = "Terminal error: " + e.getMessage();
                sendLog("❌ Terminal Error: " + e.getMessage());
            }
        } else {
            // Power actions: LOCK, SLEEP, RESTART, SHUTDOWN
            String endpoint = "/api/power/lock";
            String act = subAction.isEmpty() ? action.toLowerCase() : subAction;
            if ("sleep".equalsIgnoreCase(act)) endpoint = "/api/power/sleep";
            else if ("restart".equalsIgnoreCase(act)) endpoint = "/api/power/restart";
            else if ("shutdown".equalsIgnoreCase(act)) endpoint = "/api/power/shutdown";
            else if ("unlock".equalsIgnoreCase(act)) endpoint = "/api/power/unlock";

            try {
                sendLog("🚀 Calling http://" + currentIp + ":48880" + endpoint + "...");
                URL u = new URL("http://" + currentIp + ":48880" + endpoint);
                HttpURLConnection conn = (HttpURLConnection) u.openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(4000);
                conn.setRequestProperty("Content-Type", "application/json");
                if (agentKey != null && !agentKey.isEmpty()) {
                    conn.setRequestProperty("Authorization", "Bearer " + agentKey);
                    conn.setRequestProperty("x-agent-key", agentKey);
                }
                conn.setDoOutput(true);
                conn.getOutputStream().write("{}".getBytes("UTF-8"));
                int code = conn.getResponseCode();
                conn.disconnect();

                success = (code >= 200 && code < 300);
                message = success ? (act.toUpperCase() + " executed via Firebase Push") : ("HTTP " + code);
                sendLog(success ? ("✅ " + act.toUpperCase() + " Executed (HTTP " + code + ")") : ("❌ HTTP " + code));
            } catch (Exception e) {
                message = "FCM dispatch error: " + e.getMessage();
                sendLog("❌ Dispatch Error: " + e.getMessage());
            }
        }

        // Report Verified Execution Result to Cloud Relay
        try {
            URL resUrl = new URL(RELAY_URL + "/api/command/result");
            HttpURLConnection resConn = (HttpURLConnection) resUrl.openConnection();
            resConn.setRequestMethod("POST");
            resConn.setConnectTimeout(3000);
            resConn.setReadTimeout(3000);
            resConn.setRequestProperty("Content-Type", "application/json");
            resConn.setDoOutput(true);

            JSONObject resBody = new JSONObject();
            resBody.put("reqId", reqId);
            resBody.put("pairCode", pairCode);
            resBody.put("success", success);
            resBody.put("message", message);
            if (!resultPayload.isEmpty()) resBody.put("result", resultPayload);

            OutputStream os = resConn.getOutputStream();
            os.write(resBody.toString().getBytes("UTF-8"));
            os.close();
            resConn.getResponseCode();
            resConn.disconnect();
            Log.i(TAG, "✅ Execution result reported back to Cloud Relay: " + message);
        } catch (Exception ignored) {}
    }

    private void sendLog(String text) {
        try {
            Intent intent = new Intent("com.nexus.satellite.LOG_EVENT");
            intent.putExtra("log", text);
            sendBroadcast(intent);
        } catch (Exception ignored) {}
    }
}
