package com.nexus.satellite;

import android.util.Log;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URL;

public class SshUnlockManager {
    private static final String TAG = "NexusUnlock";

    public static boolean triggerUnlock(String targetIp, int port) {
        return triggerUnlock(targetIp, port, "");
    }

    public static boolean triggerUnlock(String targetIp, int port, String agentKey) {
        if (targetIp == null || targetIp.isEmpty()) return false;
        
        boolean httpSuccess = false;
        try {
            // 1. Send direct authenticated unlock request to PC Companion Agent on port 48880
            URL url = new URL("http://" + targetIp + ":48880/api/power/unlock");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
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
            if (code >= 200 && code < 300) {
                Log.i(TAG, "Successfully triggered console unlock via PC Agent HTTP API (HTTP " + code + ")");
                httpSuccess = true;
            } else {
                Log.w(TAG, "PC Agent returned HTTP " + code + " for unlock request");
            }
        } catch (Exception e) {
            Log.w(TAG, "PC Agent HTTP unlock failed: " + e.getMessage());
        }

        if (httpSuccess) return true;

        // 2. Fallback socket ping to port 22 (OpenSSH)
        try {
            Log.i(TAG, "Connecting to SSH server at " + targetIp + ":" + port);
            Socket socket = new Socket();
            socket.connect(new InetSocketAddress(targetIp, port), 4000);
            socket.close();
            Log.i(TAG, "SSH port active on " + targetIp);
            return true;
        } catch (Exception e) {
            Log.w(TAG, "SSH trigger failed: " + e.getMessage());
            return false;
        }
    }
}
