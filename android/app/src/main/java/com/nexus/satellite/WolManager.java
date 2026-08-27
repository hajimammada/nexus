package com.nexus.satellite;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.util.Log;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;

public class WolManager {
    private static final String TAG = "NexusWol";

    public static boolean sendWakeOnLan(Context context, String macStr) {
        if (macStr == null) return false;
        try {
            String cleanMac = macStr.replace(":", "").replace("-", "").trim();
            if (cleanMac.length() != 12) {
                Log.e(TAG, "Invalid MAC address: " + macStr);
                return false;
            }

            byte[] macBytes = new byte[6];
            for (int i = 0; i < 6; i++) {
                macBytes[i] = (byte) Integer.parseInt(cleanMac.substring(i * 2, i * 2 + 2), 16);
            }

            byte[] magicPacket = new byte[102];
            for (int i = 0; i < 6; i++) {
                magicPacket[i] = (byte) 0xFF;
            }
            for (int i = 0; i < 16; i++) {
                System.arraycopy(macBytes, 0, magicPacket, 6 + i * 6, 6);
            }

            WifiManager wifiManager = (WifiManager) context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            WifiManager.MulticastLock multicastLock = null;
            if (wifiManager != null) {
                multicastLock = wifiManager.createMulticastLock("NexusWolMulticastLock");
                multicastLock.acquire();
            }

            InetAddress broadcastAddr = InetAddress.getByName("255.255.255.255");
            DatagramSocket socket = new DatagramSocket();
            socket.setBroadcast(true);

            // Send to port 9
            DatagramPacket packet9 = new DatagramPacket(magicPacket, magicPacket.length, broadcastAddr, 9);
            socket.send(packet9);

            // Send to port 7 (fallback)
            DatagramPacket packet7 = new DatagramPacket(magicPacket, magicPacket.length, broadcastAddr, 7);
            socket.send(packet7);

            socket.close();

            if (multicastLock != null && multicastLock.isHeld()) {
                multicastLock.release();
            }

            Log.i(TAG, "WOL magic packet broadcasted for " + macStr);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error sending WOL: " + e.getMessage(), e);
            return false;
        }
    }
}
