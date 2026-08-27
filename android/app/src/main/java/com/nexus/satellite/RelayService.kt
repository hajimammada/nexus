package com.nexus.satellite

import android.app.*
import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import okhttp3.*
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class RelayService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private var webSocket: WebSocket? = null
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private var roomId: String = ""
    private var token: String = ""
    private var targetMac: String = ""
    private var targetIp: String = ""
    private var relayUrl: String = "https://nexus.hajimammad.com"

    companion object {
        const val CHANNEL_ID = "NexusSatelliteChannel"
        const val NOTIFICATION_ID = 1001
        const val TAG = "NexusRelayService"

        fun startService(context: Context, roomId: String, token: String, targetMac: String, targetIp: String, relayUrl: String) {
            val intent = Intent(context, RelayService::class.java).apply {
                putExtra("roomId", roomId)
                putExtra("token", token)
                putExtra("targetMac", targetMac)
                putExtra("targetIp", targetIp)
                putExtra("relayUrl", relayUrl)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stopService(context: Context) {
            context.stopService(Intent(context, RelayService::class.java))
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        acquireLocks()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        roomId = intent?.getStringExtra("roomId") ?: roomId
        token = intent?.getStringExtra("token") ?: token
        targetMac = intent?.getStringExtra("targetMac") ?: targetMac
        targetIp = intent?.getStringExtra("targetIp") ?: targetIp
        relayUrl = intent?.getStringExtra("relayUrl") ?: relayUrl

        startForeground(NOTIFICATION_ID, buildNotification("Connecting to Nexus Cloud Relay..."))
        connectWebSocket()

        return START_STICKY
    }

    private fun acquireLocks() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NexusSatellite::WakeLock").apply {
            acquire()
        }

        val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        wifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "NexusSatellite::WifiLock").apply {
            acquire()
        }
    }

    private fun connectWebSocket() {
        if (roomId.isEmpty()) return
        webSocket?.close(1000, "Reconnecting")

        val wsUrl = relayUrl.replace("https://", "wss://").replace("http://", "ws://") +
                "/api/relay?room=${roomId}&role=satellite&token=${token}"

        Log.i(TAG, "Connecting to WebSocket: $wsUrl")

        val request = Request.Builder().url(wsUrl).build()
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.i(TAG, "Connected to Cloud Relay Room: $roomId")
                updateNotification("Active 24/7 Home Relay • Ready for WOL")
                
                val initMsg = JSONObject().apply {
                    put("type", "SATELLITE_ONLINE")
                    put("hostname", Build.MODEL)
                    put("targetMac", targetMac)
                    put("targetIp", targetIp)
                }
                webSocket.send(initMsg.toString())
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val json = JSONObject(text)
                    Log.i(TAG, "Received message: $text")

                    if (json.optString("type") == "EXECUTE") {
                        val action = json.optString("action")
                        if (action == "WAKE") {
                            Log.i(TAG, "Executing Wake-on-LAN for $targetMac...")
                            val success = WolManager.sendWakeOnLan(this@RelayService, targetMac)
                            val resp = JSONObject().apply {
                                put("type", "ACTION_RESPONSE")
                                put("action", "WAKE")
                                put("success", success)
                                put("message", if (success) "Magic packet broadcasted on Wi-Fi" else "Failed to send packet")
                            }
                            webSocket.send(resp.toString())
                        } else if (action == "UNLOCK") {
                            Log.i(TAG, "Executing SSH Unlock for $targetIp...")
                            val success = SshUnlockManager.triggerUnlock(targetIp)
                            val resp = JSONObject().apply {
                                put("type", "ACTION_RESPONSE")
                                put("action", "UNLOCK")
                                put("success", success)
                                put("message", "Unlock signal dispatched to PC")
                            }
                            webSocket.send(resp.toString())
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error handling message: ${e.message}")
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.w(TAG, "WebSocket Closed: $reason. Retrying in 5s...")
                updateNotification("Reconnecting to Cloud Relay...")
                reconnectLater()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WebSocket Failure: ${t.message}. Retrying in 5s...")
                updateNotification("Connection dropped. Retrying...")
                reconnectLater()
            }
        })
    }

    private fun reconnectLater() {
        Thread {
            Thread.sleep(5000)
            connectWebSocket()
        }.start()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Nexus Home Satellite Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps the 24/7 Wake-on-LAN and Unlock Relay active"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(statusText: String): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
                .setContentTitle("Nexus Home Satellite")
                .setContentText(statusText)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
                .setContentTitle("Nexus Home Satellite")
                .setContentText(statusText)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build()
        }
    }

    private fun updateNotification(statusText: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildNotification(statusText))
    }

    override fun onDestroy() {
        super.onDestroy()
        webSocket?.close(1000, "Service destroyed")
        wakeLock?.let { if (it.isHeld) it.release() }
        wifiLock?.let { if (it.isHeld) it.release() }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
