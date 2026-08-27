package com.nexus.satellite

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Log
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress

object WolManager {
    private const val TAG = "NexusWol"

    fun sendWakeOnLan(context: Context, macStr: String): Boolean {
        return try {
            val cleanMac = macStr.replace(":", "").replace("-", "").trim()
            if (cleanMac.length != 12) {
                Log.e(TAG, "Invalid MAC address: $macStr")
                return false
            }

            val macBytes = ByteArray(6)
            for (i in 0 until 6) {
                macBytes[i] = cleanMac.substring(i * 2, i * 2 + 2).toInt(16).toByte()
            }

            val magicPacket = ByteArray(102)
            for (i in 0 until 6) {
                magicPacket[i] = 0xFF.toByte()
            }
            for (i in 0 until 16) {
                System.arraycopy(macBytes, 0, magicPacket, 6 + i * 6, 6)
            }

            // Acquire WiFi Multicast lock if on Android
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            val multicastLock = wifiManager?.createMulticastLock("NexusWolMulticastLock")
            multicastLock?.acquire()

            val broadcastAddr = InetAddress.getByName("255.255.255.255")
            val socket = DatagramSocket()
            socket.broadcast = true

            // Send to port 9
            val packet9 = DatagramPacket(magicPacket, magicPacket.size, broadcastAddr, 9)
            socket.send(packet9)

            // Send to port 7 (fallback)
            val packet7 = DatagramPacket(magicPacket, magicPacket.size, broadcastAddr, 7)
            socket.send(packet7)

            socket.close()
            multicastLock?.release()

            Log.i(TAG, "WOL magic packet broadcasted for $macStr")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Error sending WOL: ${e.message}", e)
            false
        }
    }
}
