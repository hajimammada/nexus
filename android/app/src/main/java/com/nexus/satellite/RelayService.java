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

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

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
    private final AtomicBoolean isReconnecting = new AtomicBoolean(false);
    private ScheduledExecutorService syncScheduler;

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
        startDualChannelSync();
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

        Request request = new Request.Builder()
                .url(wsUrl)
                .addHeader("User-Agent", "Nexus-Android-Satellite/" + BuildConfig.VERSION_NAME)
                .build();
        webSocket = client.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket ws, Response response) {
                isReconnecting.set(false);
                Log.i(TAG, "Connected to Cloud Relay Room: " + roomId);
                updateNotification("Active 24/7 Home Gateway • Ready for Commands");

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
                    Log.i(TAG, "Received WebSocket Command: " + text);
                    String type = json.optString("type", "");

                    if ("AGENT_ONLINE".equals(type) || "TELEMETRY".equals(type) || "ANNOUNCE".equals(type)) {
                        JSONObject tele = json.optJSONObject("telemetry");
                        String incomingIp = json.optString("localIp", json.optString("ip", ""));
                        String incomingMac = json.optString("mac", json.optString("targetMac", ""));
                        String incomingHostname = json.optString("hostname", tele != null ? tele.optString("hostname", "PC") : "PC");
                        String incomingKey = json.optString("agentKey", "");

                        if (!incomingIp.isEmpty() || !incomingMac.isEmpty()) {
                            SharedPreferences prefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE);
                            boolean isPaired = prefs.getBoolean("paired", false);
                            if (!isPaired) {
                                return;
                            }
                            SharedPreferences.Editor editor = prefs.edit();
                            if (!incomingIp.isEmpty()) {
                                targetIp = incomingIp;
                                editor.putString("targetIp", incomingIp);
                            }
                            if (!incomingMac.isEmpty()) {
                                targetMac = incomingMac;
                                editor.putString("targetMac", incomingMac);
                            }
                            if (!incomingHostname.isEmpty()) {
                                editor.putString("hostname", incomingHostname);
                            }
                            if (!incomingKey.isEmpty()) {
                                editor.putString("agentKey", incomingKey);
                            }
                            editor.apply();

                            Intent logIntent = new Intent("com.nexus.satellite.LOG_EVENT");
                            logIntent.putExtra("log", "💻 PC Discovered via WebSocket: " + incomingHostname + " (IP: " + incomingIp + ", MAC: " + incomingMac + ")");
                            sendBroadcast(logIntent);
                        }
                    } else if ("EXECUTE".equals(type)) {
                        executeIncomingCommand(json);
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

    // -------------------------------------------------------------
    // Dual-Channel Sync Engine (Long Polling & Telemetry Ingestion)
    // -------------------------------------------------------------
    private void startDualChannelSync() {
        if (syncScheduler != null && !syncScheduler.isShutdown()) return;
        syncScheduler = Executors.newSingleThreadScheduledExecutor();
        syncScheduler.scheduleWithFixedDelay(new Runnable() {
            @Override
            public void run() {
                try {
                    pollAndSync();
                } catch (Exception e) {
                    Log.w(TAG, "Sync loop error: " + e.getMessage());
                }
            }
        }, 1, 2, TimeUnit.SECONDS);
    }

    private void pollAndSync() {
        SharedPreferences prefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE);
        boolean paired = prefs.getBoolean("paired", false);
        String pairCode = prefs.getString("currentPin", "");
        if (pairCode.isEmpty()) {
            String roomId = prefs.getString("roomId", "");
            if (roomId.contains("_")) {
                String[] parts = roomId.split("_");
                if (parts.length > 1) pairCode = parts[1];
            }
        }
        final String currentCode = pairCode;
        final String currentIp = prefs.getString("targetIp", "");
        final String currentMac = prefs.getString("targetMac", "");
        final String agentKey = prefs.getString("agentKey", "");
        final String hostname = prefs.getString("hostname", "PC");

        if (!paired || currentIp.isEmpty()) return;

        // 1. Fetch live telemetry from PC Agent (if online)
        JSONObject telemetryObj = null;
        try {
            URL pcUrl = new URL("http://" + currentIp + ":48880/api/status");
            HttpURLConnection pcConn = (HttpURLConnection) pcUrl.openConnection();
            pcConn.setConnectTimeout(1500);
            pcConn.setReadTimeout(1500);
            if (agentKey != null && !agentKey.isEmpty()) {
                pcConn.setRequestProperty("Authorization", "Bearer " + agentKey);
                pcConn.setRequestProperty("x-agent-key", agentKey);
            }
            if (pcConn.getResponseCode() == 200) {
                BufferedReader br = new BufferedReader(new InputStreamReader(pcConn.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
                br.close();
                JSONObject fullJson = new JSONObject(sb.toString());
                telemetryObj = fullJson.optJSONObject("data");
            }
            pcConn.disconnect();
        } catch (Exception ignored) {}

        // 2. Register Satellite state & Telemetry to Cloud Relay
        try {
            URL regUrl = new URL(relayUrl + "/api/pair/register");
            HttpURLConnection regConn = (HttpURLConnection) regUrl.openConnection();
            regConn.setRequestMethod("POST");
            regConn.setConnectTimeout(3000);
            regConn.setReadTimeout(3000);
            regConn.setRequestProperty("Content-Type", "application/json");
            regConn.setDoOutput(true);

            JSONObject regBody = new JSONObject();
            regBody.put("pairCode", currentCode);
            regBody.put("roomId", "room_" + currentCode + "_pc");
            regBody.put("token", "token_" + currentCode);
            regBody.put("mac", currentMac);
            regBody.put("localIp", currentIp);
            regBody.put("hostname", hostname);
            regBody.put("agentKey", agentKey);
            if (telemetryObj != null) regBody.put("telemetry", telemetryObj);

            OutputStream os = regConn.getOutputStream();
            os.write(regBody.toString().getBytes("UTF-8"));
            os.close();

            if (regConn.getResponseCode() == 200) {
                BufferedReader br = new BufferedReader(new InputStreamReader(regConn.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
                br.close();

                JSONObject resp = new JSONObject(sb.toString());
                JSONArray commands = resp.optJSONArray("commands");
                if (commands != null && commands.length() > 0) {
                    for (int i = 0; i < commands.length(); i++) {
                        executeIncomingCommand(commands.getJSONObject(i));
                    }
                }
            }
            regConn.disconnect();
        } catch (Exception e) {
            Log.w(TAG, "Heartbeat register error: " + e.getMessage());
        }
    }

    // -------------------------------------------------------------
    // Universal Command Execution Engine (WOL, Unlock, Power, Terminal)
    // -------------------------------------------------------------
    private void executeIncomingCommand(final JSONObject json) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String action = json.optString("action", "").toUpperCase();
                    String subAction = json.optString("subAction", "").toLowerCase();
                    JSONObject payload = json.optJSONObject("payload");
                    if (payload == null) payload = new JSONObject();
                    String reqId = json.optString("reqId", String.valueOf(System.currentTimeMillis()));

                    SharedPreferences prefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE);
                    boolean paired = prefs.getBoolean("paired", false);
                    String pairCode = prefs.getString("currentPin", "");
                    if (pairCode.isEmpty()) {
                        String roomId = prefs.getString("roomId", "");
                        if (roomId.contains("_")) {
                            String[] parts = roomId.split("_");
                            if (parts.length > 1) pairCode = parts[1];
                        }
                    }
                    String currentIp = prefs.getString("targetIp", "");
                    String currentMac = prefs.getString("targetMac", "");
                    String agentKey = prefs.getString("agentKey", "");

                    if (!paired || currentIp.isEmpty()) {
                        Log.w(TAG, "Command ignored: Satellite is not paired with a PC.");
                        return;
                    }

                    boolean success = false;
                    String message = "";
                    String resultPayload = "";

                    Log.i(TAG, "🚀 EXECUTING MASTER GATEWAY ACTION: " + action + " (subAction: " + subAction + ", reqId: " + reqId + ")");

                    if ("WAKE".equals(action) || "TURN ON".equals(action)) {
                        success = WolManager.sendWakeOnLan(RelayService.this, currentMac);
                        message = success ? "Wake-on-LAN magic packet broadcasted on Wi-Fi" : "Failed to broadcast WOL packet";
                    } else if ("UNLOCK".equals(action)) {
                        success = SshUnlockManager.triggerUnlock(currentIp, 22, agentKey);
                        message = success ? "Unlock signal dispatched to PC" : "Could not reach PC unlock endpoint";
                    } else if ("TERMINAL".equals(action)) {
                        String cmd = payload.optString("command", "");
                        String cwd = payload.optString("cwd", "");
                        try {
                            URL u = new URL("http://" + currentIp + ":48880/api/terminal/exec");
                            HttpURLConnection conn = (HttpURLConnection) u.openConnection();
                            conn.setRequestMethod("POST");
                            conn.setConnectTimeout(6000);
                            conn.setReadTimeout(12000);
                            conn.setRequestProperty("Content-Type", "application/json");
                            if (agentKey != null && !agentKey.isEmpty()) {
                                conn.setRequestProperty("Authorization", "Bearer " + agentKey);
                                conn.setRequestProperty("x-agent-key", agentKey);
                            }
                            conn.setDoOutput(true);
                            JSONObject termReq = new JSONObject();
                            termReq.put("command", cmd);
                            if (!cwd.isEmpty()) termReq.put("cwd", cwd);

                            OutputStream os = conn.getOutputStream();
                            os.write(termReq.toString().getBytes("UTF-8"));
                            os.close();

                            int code = conn.getResponseCode();
                            if (code == 200) {
                                BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                                StringBuilder sb = new StringBuilder();
                                String line;
                                while ((line = br.readLine()) != null) sb.append(line).append("\n");
                                br.close();
                                resultPayload = sb.toString();
                                success = true;
                                message = "Command executed.";
                            } else {
                                message = "Terminal returned HTTP " + code;
                            }
                            conn.disconnect();
                        } catch (Exception e) {
                            message = "Terminal execution error: " + e.getMessage();
                        }
                    } else {
                        // Power Actions: LOCK, SLEEP, RESTART, SHUTDOWN
                        String endpoint = "/api/power/lock";
                        String act = subAction.isEmpty() ? action.toLowerCase() : subAction;
                        if ("sleep".equalsIgnoreCase(act)) endpoint = "/api/power/sleep";
                        else if ("restart".equalsIgnoreCase(act)) endpoint = "/api/power/restart";
                        else if ("shutdown".equalsIgnoreCase(act)) endpoint = "/api/power/shutdown";
                        else if ("unlock".equalsIgnoreCase(act)) endpoint = "/api/power/unlock";

                        try {
                            URL u = new URL("http://" + currentIp + ":48880" + endpoint);
                            HttpURLConnection conn = (HttpURLConnection) u.openConnection();
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

                            success = (code >= 200 && code < 300);
                            message = success ? (act.toUpperCase() + " executed via Satellite Gateway") : ("HTTP " + code);
                        } catch (Exception e) {
                            message = "Satellite dispatch error: " + e.getMessage();
                        }
                    }

                    // 1. Send WebSocket ACK
                    if (webSocket != null) {
                        try {
                            JSONObject ack = new JSONObject();
                            ack.put("type", "ACTION_RESPONSE");
                            ack.put("reqId", reqId);
                            ack.put("action", action);
                            ack.put("subAction", subAction);
                            ack.put("success", success);
                            ack.put("message", message);
                            if (!resultPayload.isEmpty()) ack.put("result", resultPayload);
                            webSocket.send(ack.toString());
                        } catch (Exception ignored) {}
                    }

                    // 2. Send HTTP Result to Cloud Relay
                    try {
                        URL resUrl = new URL(relayUrl + "/api/command/result");
                        HttpURLConnection resConn = (HttpURLConnection) resUrl.openConnection();
                        resConn.setRequestMethod("POST");
                        resConn.setConnectTimeout(3000);
                        resConn.setReadTimeout(3000);
                        resConn.setRequestProperty("Content-Type", "application/json");
                        resConn.setDoOutput(true);

                        JSONObject resBody = new JSONObject();
                        resBody.put("reqId", reqId);
                        resBody.put("pairCode", pairCode);
                        resBody.put("success", success);
                        resBody.put("message", message);
                        if (!resultPayload.isEmpty()) resBody.put("result", resultPayload);

                        OutputStream os = resConn.getOutputStream();
                        os.write(resBody.toString().getBytes("UTF-8"));
                        os.close();
                        resConn.getResponseCode();
                        resConn.disconnect();
                    } catch (Exception ignored) {}

                } catch (Exception e) {
                    Log.e(TAG, "Error in executeIncomingCommand: " + e.getMessage());
                }
            }
        }).start();
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
                    .build();
        }
    }

    private void updateNotification(String statusText) {
        try {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.notify(NOTIFICATION_ID, buildNotification(statusText));
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (syncScheduler != null) syncScheduler.shutdownNow();
        if (webSocket != null) webSocket.close(1000, "Service stopped");
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
