package com.nexus.satellite;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            SharedPreferences prefs = context.getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE);
            boolean paired = prefs.getBoolean("paired", false);
            String roomId = prefs.getString("roomId", "");
            String token = prefs.getString("token", "");
            String targetMac = prefs.getString("targetMac", "");
            String targetIp = prefs.getString("targetIp", "");
            String relayUrl = prefs.getString("relayUrl", "https://nexus.hajimammad.com");

            if (paired && roomId != null && !roomId.isEmpty()) {
                RelayService.startService(context, roomId, token, targetMac, targetIp, relayUrl);
            }
        }
    }
}
