package com.nexus.satellite;

import android.util.Log;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URL;

public class SshUnlockManager {
    private static final String TAG = "NexusUnlock";

    public static boolean triggerUnlock(String targetIp, int port) {
        if (targetIp == null || targetIp.isEmpty()) return false;
        
        boolean httpSuccess = false;
        try {
            // 1. Send direct unlock request to PC Companion Agent on port 48880
            URL url = new URL("http://" + targetIp + ":48880/api/power/unlock");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(3000);
            conn.setReadTimeout(3000);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            int code = conn.getResponseCode();
            conn.disconnect();
            if (code >= 200 && code < 300) {
                Log.i(TAG, "Successfully triggered console unlock via PC Agent HTTP API");
                httpSuccess = true;
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
