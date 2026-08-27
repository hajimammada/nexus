package com.nexus.satellite

import android.util.Log
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket

object SshUnlockManager {
    private const val TAG = "NexusUnlock"

    fun triggerUnlock(targetIp: String, port: Int = 22): Boolean {
        return try {
            Log.i(TAG, "Connecting to SSH server at $targetIp:$port...")
            val socket = Socket()
            socket.connect(InetSocketAddress(targetIp, port), 5000)
            socket.close()
            Log.i(TAG, "SSH port active on $targetIp")
            true
        } catch (e: Exception) {
            Log.w(TAG, "SSH trigger failed: ${e.message}")
            false
        }
    }
}
