package com.nexus.satellite;

import android.util.Log;

import java.net.InetSocketAddress;
import java.net.Socket;

public class SshUnlockManager {
    private static final String TAG = "NexusUnlock";

    public static boolean triggerUnlock(String targetIp, int port) {
        if (targetIp == null || targetIp.isEmpty()) return false;
        try {
            Log.i(TAG, "Connecting to SSH server at " + targetIp + ":" + port);
            Socket socket = new Socket();
            socket.connect(new InetSocketAddress(targetIp, port), 5000);
            socket.close();
            Log.i(TAG, "SSH port active on " + targetIp);
            return true;
        } catch (Exception e) {
            Log.w(TAG, "SSH trigger failed: " + e.getMessage());
            return false;
        }
    }
}
