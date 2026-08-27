package com.nexus.satellite;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

public class RelayService extends Service {

    public static final String CHANNEL_ID = "NexusSatelliteChannel";
    public static final int NOTIFICATION_ID = 1001;
    private static final String TAG = "NexusRelayService";

    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private WebSocket webSocket;
    private final java.util.concurrent.atomic.AtomicBoolean isReconnecting = new java.util.concurrent.atomic.AtomicBoolean(false);
    private final OkHttpClient client = new OkHttpClient.Builder()
            .pingInterval(15, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .retryOnConnectionFailure(true)
            .build();

    private String roomId = "";
    private String token = "";
    private String targetMac = "";
    private String targetIp = "";
    private String relayUrl = "https://nexus.hajimammad.com";

    public static void startService(Context context, String roomId, String token, String targetMac, String targetIp, String relayUrl) {
        Intent intent = new Intent(context, RelayService.class);
        intent.putExtra("roomId", roomId);
        intent.putExtra("token", token);
        intent.putExtra("targetMac", targetMac);
        intent.putExtra("targetIp", targetIp);
        intent.putExtra("relayUrl", relayUrl);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stopService(Context context) {
        context.stopService(new Intent(context, RelayService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        acquireLocks();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            if (intent.hasExtra("roomId")) roomId = intent.getStringExtra("roomId");
            if (intent.hasExtra("token")) token = intent.getStringExtra("token");
            if (intent.hasExtra("targetMac")) targetMac = intent.getStringExtra("targetMac");
            if (intent.hasExtra("targetIp")) targetIp = intent.getStringExtra("targetIp");
            if (intent.hasExtra("relayUrl")) relayUrl = intent.getStringExtra("relayUrl");
        }

        startForeground(NOTIFICATION_ID, buildNotification("Active 24/7 Home Relay • Connecting..."));
        connectWebSocket();

        return START_STICKY;
    }

    private void acquireLocks() {
        try {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NexusSatellite::WakeLock");
                wakeLock.acquire();
            }

            WifiManager wifiManager = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifiManager != null) {
                wifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "NexusSatellite::WifiLock");
                wifiLock.acquire();
            }
        } catch (Exception e) {
            Log.e(TAG, "Error acquiring locks: " + e.getMessage());
        }
    }

    private synchronized void connectWebSocket() {
        if (roomId == null || roomId.isEmpty()) return;

        try {
            if (webSocket != null) {
                webSocket.cancel();
                webSocket = null;
            }
        } catch (Exception ignored) {}

        String wsUrl = relayUrl.replace("https://", "wss://").replace("http://", "ws://") +
                "/api/relay?room=" + roomId + "&role=satellite&token=" + token;

        Log.i(TAG, "Connecting to WebSocket: " + wsUrl);

        Request request = new Request.Builder().url(wsUrl).build();
        webSocket = client.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket ws, Response response) {
                isReconnecting.set(false);
                Log.i(TAG, "Connected to Cloud Relay Room: " + roomId);
                updateNotification("Active 24/7 Home Relay • Ready for WOL");

                try {
                    JSONObject initMsg = new JSONObject();
                    initMsg.put("type", "SATELLITE_ONLINE");
                    initMsg.put("hostname", Build.MODEL);
                    initMsg.put("targetMac", targetMac);
                    initMsg.put("targetIp", targetIp);
                    ws.send(initMsg.toString());
                } catch (Exception e) {
                    Log.e(TAG, "Error sending online status: " + e.getMessage());
                }
            }

            @Override
            public void onMessage(WebSocket ws, String text) {
                try {
                    JSONObject json = new JSONObject(text);
                    Log.i(TAG, "Received message: " + text);

                    if ("EXECUTE".equals(json.optString("type"))) {
                        String action = json.optString("action");
                        String subAction = json.optString("subAction", "");
                        SharedPreferences prefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE);
                        final String agentKey = prefs.getString("agentKey", "");
                        final String currentIp = (targetIp != null && !targetIp.isEmpty()) ? targetIp : prefs.getString("targetIp", "192.168.100.50");
                        final String currentMac = (targetMac != null && !targetMac.isEmpty()) ? targetMac : prefs.getString("targetMac", "74:56:3C:48:E0:7F");

                        if ("WAKE".equals(action)) {
                            Log.i(TAG, "Executing Wake-on-LAN for " + currentMac);
                            boolean success = WolManager.sendWakeOnLan(RelayService.this, currentMac);
                            JSONObject resp = new JSONObject();
                            resp.put("type", "ACTION_RESPONSE");
                            resp.put("action", "WAKE");
                            resp.put("success", success);
                            resp.put("message", success ? "Magic packet broadcasted on Wi-Fi" : "Failed to send packet");
                            ws.send(resp.toString());
                        } else if ("UNLOCK".equals(action)) {
                            Log.i(TAG, "Executing Unlock for " + currentIp);
                            boolean success = SshUnlockManager.triggerUnlock(currentIp, 22);
                            JSONObject resp = new JSONObject();
                            resp.put("type", "ACTION_RESPONSE");
                            resp.put("action", "UNLOCK");
                            resp.put("success", success);
                            resp.put("message", success ? "Unlock command sent to PC" : "Failed to trigger unlock");
                            ws.send(resp.toString());
                        } else if ("POWER".equals(action) || "LOCK".equals(action) || "SLEEP".equals(action) || "RESTART".equals(action)) {
                            String endpoint = "/api/power/lock";
                            if ("SLEEP".equalsIgnoreCase(subAction) || "SLEEP".equalsIgnoreCase(action)) endpoint = "/api/power/sleep";
                            else if ("RESTART".equalsIgnoreCase(subAction) || "RESTART".equalsIgnoreCase(action)) endpoint = "/api/power/restart";
                            else if ("UNLOCK".equalsIgnoreCase(subAction) || "UNLOCK".equalsIgnoreCase(action)) endpoint = "/api/power/unlock";

                            final String finalEndpoint = endpoint;
                            new Thread(new Runnable() {
                                @Override
                                public void run() {
                                    try {
                                        java.net.URL u = new java.net.URL("http://" + currentIp + ":48880" + finalEndpoint);
                                        java.net.HttpURLConnection conn = (java.net.HttpURLConnection) u.openConnection();
                                        conn.setRequestMethod("POST");
                                        conn.setConnectTimeout(4000);
                                        conn.setReadTimeout(4000);
                                        conn.setRequestProperty("Content-Type", "application/json");
                                        if (agentKey != null && !agentKey.isEmpty()) {
                                            conn.setRequestProperty("Authorization", "Bearer " + agentKey);
                                            conn.setRequestProperty("x-agent-key", agentKey);
                                        }
                                        conn.setDoOutput(true);
                                        int code = conn.getResponseCode();
                                        conn.disconnect();
                                        Log.i(TAG, "Power dispatch " + finalEndpoint + " returned " + code);

                                        JSONObject resp = new JSONObject();
                                        resp.put("type", "ACTION_RESPONSE");
                                        resp.put("action", action);
                                        resp.put("subAction", subAction);
                                        resp.put("success", code >= 200 && code < 300);
                                        resp.put("message", (code >= 200 && code < 300) ? (finalEndpoint.replace("/api/power/", "").toUpperCase() + " executed via Satellite Gateway") : ("HTTP " + code));
                                        ws.send(resp.toString());
                                    } catch (Exception e) {
                                        Log.w(TAG, "Power dispatch error: " + e.getMessage());
                                        try {
                                            JSONObject resp = new JSONObject();
                                            resp.put("type", "ACTION_RESPONSE");
                                            resp.put("action", action);
                                            resp.put("success", false);
                                            resp.put("message", "Satellite Gateway error: " + e.getMessage());
                                            ws.send(resp.toString());
                                        } catch (Exception ignored) {}
                                    }
                                }
                            }).start();
                        }
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error handling message: " + e.getMessage());
                }
            }

            @Override
            public void onClosed(WebSocket ws, int code, String reason) {
                Log.w(TAG, "WebSocket Closed (" + code + "). Reconnecting in 4s...");
                scheduleReconnect();
            }

            @Override
            public void onFailure(WebSocket ws, Throwable t, Response response) {
                Log.e(TAG, "WebSocket Failure: " + (t != null ? t.getMessage() : "Dropped") + ". Reconnecting in 4s...");
                scheduleReconnect();
            }
        });
    }

    private void scheduleReconnect() {
        if (isReconnecting.compareAndSet(false, true)) {
            updateNotification("Reconnecting to Cloud Relay...");
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Thread.sleep(4000);
                    } catch (InterruptedException ignored) {}
                    connectWebSocket();
                }
            }).start();
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Nexus Home Satellite Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Keeps the 24/7 Wake-on-LAN and Unlock Relay active");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification(String statusText) {
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return new Notification.Builder(this, CHANNEL_ID)
                    .setContentTitle("Nexus Home Satellite")
                    .setContentText(statusText)
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentIntent(pendingIntent)
                    .setOngoing(true)
                    .build();
        } else {
            return new Notification.Builder(this)
                    .setContentTitle("Nexus Home Satellite")
                    .setContentText(statusText)
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentIntent(pendingIntent)
                    .setOngoing(true)
                    .build();
        }
    }

    private void updateNotification(String statusText) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification(statusText));
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (webSocket != null) {
            webSocket.close(1000, "Service destroyed");
        }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
