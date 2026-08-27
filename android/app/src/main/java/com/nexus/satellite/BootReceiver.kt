package com.nexus.satellite

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val prefs = context.getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE)
            val paired = prefs.getBoolean("paired", false)
            val roomId = prefs.getString("roomId", "") ?: ""
            val token = prefs.getString("token", "") ?: ""
            val targetMac = prefs.getString("targetMac", "") ?: ""
            val targetIp = prefs.getString("targetIp", "") ?: ""
            val relayUrl = prefs.getString("relayUrl", "https://nexus.hajimammad.com") ?: "https://nexus.hajimammad.com"

            if (paired && roomId.isNotEmpty()) {
                RelayService.startService(context, roomId, token, targetMac, targetIp, relayUrl)
            }
        }
    }
}
