package com.nexus.satellite;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONObject;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class MainActivity extends AppCompatActivity {

    private TextView tvStatus;
    private View dotStatus;
    private LinearLayout cardTargetInfo;
    private TextView tvTargetName;
    private TextView tvTargetIp;
    private TextView tvTargetMac;
    private Button btnUnlink;

    // Direct LAN Control Buttons
    private Button btnTestPing;
    private Button btnTestWol;
    private Button btnTestLock;
    private Button btnTestUnlock;
    private Button btnTestSleep;
    private Button btnTestRestart;

    // Local LAN Auto-Discovery Components
    private Button btnScanLan;
    private LinearLayout cardDiscoveredPc;
    private TextView tvDiscoveredName;
    private TextView tvDiscoveredIp;
    private Button btnLinkDiscovered;

    private String discoveredIp = "";
    private String discoveredMac = "";
    private String discoveredHostname = "";
    private String discoveredPin = "";
    private String discoveredAgentKey = "";

    // Diagnostic Console Log
    private TextView tvLogs;
    private ScrollView scrollLogs;
    private TextView btnClearLogs;

    private final OkHttpClient httpClient = new OkHttpClient.Builder()
            .connectTimeout(4, TimeUnit.SECONDS)
            .readTimeout(6, TimeUnit.SECONDS)
            .build();

    private final String relayUrl = "https://nexus.hajimammad.com";
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final SimpleDateFormat timeFormat = new SimpleDateFormat("HH:mm:ss", Locale.getDefault());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        tvStatus = findViewById(R.id.tvStatus);
        dotStatus = findViewById(R.id.dotStatus);
        cardTargetInfo = findViewById(R.id.cardTargetInfo);
        tvTargetName = findViewById(R.id.tvTargetName);
        tvTargetIp = findViewById(R.id.tvTargetIp);
        tvTargetMac = findViewById(R.id.tvTargetMac);
        btnUnlink = findViewById(R.id.btnUnlink);

        btnTestPing = findViewById(R.id.btnTestPing);
        btnTestWol = findViewById(R.id.btnTestWol);
        btnTestLock = findViewById(R.id.btnTestLock);
        btnTestUnlock = findViewById(R.id.btnTestUnlock);
        btnTestSleep = findViewById(R.id.btnTestSleep);
        btnTestRestart = findViewById(R.id.btnTestRestart);

        tvLogs = findViewById(R.id.tvLogs);
        scrollLogs = findViewById(R.id.scrollLogs);
        btnClearLogs = findViewById(R.id.btnClearLogs);

        // Local Wi-Fi Auto-Discovery UI
        btnScanLan = findViewById(R.id.btnScanLan);
        cardDiscoveredPc = findViewById(R.id.cardDiscoveredPc);
        tvDiscoveredName = findViewById(R.id.tvDiscoveredName);
        tvDiscoveredIp = findViewById(R.id.tvDiscoveredIp);
        btnLinkDiscovered = findViewById(R.id.btnLinkDiscovered);

        btnScanLan.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                scanLocalNetwork();
            }
        });

        btnLinkDiscovered.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                linkDiscoveredPcDirectly();
            }
        });

        if (btnUnlink != null) {
            btnUnlink.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    RelayService.stopService(MainActivity.this);

                    SharedPreferences prefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE);
                    String oldPin = prefs.getString("currentPin", "");
                    if (oldPin != null && !oldPin.isEmpty()) {
                        try {
                            com.google.firebase.messaging.FirebaseMessaging.getInstance().unsubscribeFromTopic("nexus_" + oldPin);
                        } catch (Exception ignored) {}
                    }
                    prefs.edit().clear().apply();

                    discoveredHostname = "";
                    discoveredIp = "";
                    discoveredMac = "";
                    discoveredPin = "";

                    updateUiUnpaired();
                    appendLog("🔌 Unlinked from PC. Scanning Wi-Fi for local devices...");
                    Toast.makeText(MainActivity.this, "Unlinked from PC", Toast.LENGTH_SHORT).show();
                    scanLocalNetwork();
                }
            });
        }

        TextView tvFooter = findViewById(R.id.tvFooterVersion);
        if (tvFooter != null) {
            tvFooter.setText("Nexus Satellite v" + BuildConfig.VERSION_NAME + " • Direct LAN & Cloud Gateway");
        }

        NexusFirebaseMessagingService.subscribeToCurrentTopic(this);
        loadSavedState();
        checkBatteryOptimization();

        // Automatically scan local Wi-Fi on startup
        scanLocalNetwork();

        android.content.BroadcastReceiver logReceiver = new android.content.BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent != null && intent.hasExtra("log")) {
                    appendLog(intent.getStringExtra("log"));
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            loadSavedState();
                        }
                    });
                }
            }
        };
        android.content.IntentFilter filter = new android.content.IntentFilter("com.nexus.satellite.LOG_EVENT");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(logReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(logReceiver, filter);
        }

        btnClearLogs.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                tvLogs.setText("");
            }
        });

        // 1. Direct LAN Ping & Health Check
        btnTestPing.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                executeLanAction("Ping & Health Check", "/api/ping", "GET", null);
            }
        });

        // 2. Direct LAN Wake-on-LAN
        btnTestWol.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                SharedPreferences prefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE);
                final String mac = prefs.getString("targetMac", "");
                if (mac == null || mac.isEmpty()) {
                    appendLog("❌ No PC linked. Please scan Wi-Fi and link your PC first.");
                    Toast.makeText(MainActivity.this, "No PC Linked", Toast.LENGTH_SHORT).show();
                    return;
                }
                appendLog("⚡ [WOL] Broadcasting Magic Packet to " + mac + "...");

                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        final boolean success = WolManager.sendWakeOnLan(MainActivity.this, mac);
                        mainHandler.post(new Runnable() {
                            @Override
                            public void run() {
                                if (success) {
                                    appendLog("✅ [WOL] Magic packet broadcasted to UDP 9 & 7 successfully.");
                                    Toast.makeText(MainActivity.this, "WOL Magic Packet Sent!", Toast.LENGTH_SHORT).show();
                                } else {
                                    appendLog("❌ [WOL] Failed to broadcast magic packet.");
                                    Toast.makeText(MainActivity.this, "WOL Broadcast Failed", Toast.LENGTH_SHORT).show();
                                }
                            }
                        });
                    }
                }).start();
            }
        });

        // 3. Direct LAN Lock Screen
        btnTestLock.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                executeLanAction("Lock Workstation", "/api/power/lock", "POST", "{}");
            }
        });

        // 4. Direct LAN Unlock Session
        btnTestUnlock.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                executeLanAction("Unlock Console Session", "/api/power/unlock", "POST", "{}");
            }
        });

        // 5. Direct LAN Sleep Mode
        btnTestSleep.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                executeLanAction("Suspend / Sleep Mode", "/api/power/sleep", "POST", "{}");
            }
        });

        // 6. Direct LAN Restart PC
        btnTestRestart.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                executeLanAction("System Restart", "/api/power/restart", "POST", "{}");
            }
        });
    }

    private void executeLanAction(final String actionName, final String endpoint, final String method, final String jsonBody) {
        SharedPreferences prefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE);
        String ip = prefs.getString("targetIp", "");
        final String agentKey = prefs.getString("agentKey", "");
        final String currentPin = prefs.getString("currentPin", "");

        if (ip == null || ip.isEmpty()) {
            appendLog("❌ Cannot execute [" + actionName + "]: Satellite is not linked to any PC. Scan Wi-Fi to link first.");
            Toast.makeText(MainActivity.this, "Please link with a PC first", Toast.LENGTH_SHORT).show();
            return;
        }
        final String url = "http://" + ip + ":48880" + endpoint;

        appendLog("🚀 [" + actionName + "] Sending " + method + " -> " + url + "...");
        final long startTime = System.currentTimeMillis();

        Request.Builder reqBuilder = new Request.Builder().url(url);
        if (agentKey != null && !agentKey.isEmpty()) {
            reqBuilder.addHeader("Authorization", "Bearer " + agentKey);
            reqBuilder.addHeader("x-agent-key", agentKey);
        }
        if (currentPin != null && !currentPin.isEmpty()) {
            reqBuilder.addHeader("x-pair-code", currentPin);
        }

        if ("POST".equalsIgnoreCase(method)) {
            MediaType mediaType = MediaType.parse("application/json; charset=utf-8");
            RequestBody body = RequestBody.create(mediaType, jsonBody != null ? jsonBody : "{}");
            reqBuilder.post(body);
        } else {
            reqBuilder.get();
        }

        httpClient.newCall(reqBuilder.build()).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, final IOException e) {
                final long duration = System.currentTimeMillis() - startTime;
                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        appendLog("❌ [" + actionName + "] Connection failed (" + duration + "ms): " + e.getMessage());
                        Toast.makeText(MainActivity.this, actionName + " Failed: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                    }
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                final long duration = System.currentTimeMillis() - startTime;
                final int code = response.code();
                final String bodyStr = response.body() != null ? response.body().string() : "";

                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        if (code >= 200 && code < 300) {
                            appendLog("✅ [" + actionName + "] " + code + " OK (" + duration + "ms): " + bodyStr);
                            Toast.makeText(MainActivity.this, "✅ " + actionName + " Executed!", Toast.LENGTH_SHORT).show();
                        } else {
                            appendLog("⚠️ [" + actionName + "] HTTP " + code + " (" + duration + "ms): " + bodyStr);
                            Toast.makeText(MainActivity.this, "HTTP " + code + ": " + bodyStr, Toast.LENGTH_SHORT).show();
                        }
                    }
                });
            }
        });
    }

    private void appendLog(String message) {
        final String timestamp = timeFormat.format(new Date());
        final String logLine = "[" + timestamp + "] " + message + "\n";
        
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (tvLogs != null) {
                    tvLogs.append(logLine);
                    if (scrollLogs != null) {
                        scrollLogs.post(new Runnable() {
                            @Override
                            public void run() {
                                scrollLogs.fullScroll(View.FOCUS_DOWN);
                            }
                        });
                    }
                }
            }
        });
    }

    private void loadSavedState() {
        SharedPreferences prefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE);
        boolean paired = prefs.getBoolean("paired", false);
        String mac = prefs.getString("targetMac", "");
        String ip = prefs.getString("targetIp", "");
        String hostname = prefs.getString("hostname", "PC");
        String roomId = prefs.getString("roomId", "");
        String token = prefs.getString("token", "");

        if (paired && roomId != null && !roomId.isEmpty() && !ip.isEmpty()) {
            updateUiPaired(hostname, mac, ip);
            appendLog("✓ Restored session for " + hostname + " (IP: " + ip + ", MAC: " + mac + ")");
            RelayService.startService(this, roomId, token, mac, ip, relayUrl);
        } else {
            updateUiUnpaired();
        }
    }

    private void updateUiPaired(String hostname, String mac, String ip) {
        tvStatus.setText("ONLINE • 24/7 HOME RELAY LINKED");
        tvStatus.setTextColor(Color.parseColor("#10B981"));
        dotStatus.setBackgroundColor(Color.parseColor("#10B981"));

        cardTargetInfo.setVisibility(View.VISIBLE);
        tvTargetName.setText("Target: " + (hostname.isEmpty() ? "PC" : hostname));
        tvTargetIp.setText("LAN IP: " + ip + ":48880");
        tvTargetMac.setText("Target MAC: " + mac);
        if (cardDiscoveredPc != null) {
            cardDiscoveredPc.setVisibility(View.GONE);
        }
    }

    private void updateUiUnpaired() {
        tvStatus.setText("READY • SCAN WI-FI TO LINK PC");
        tvStatus.setTextColor(Color.parseColor("#94A3B8"));
        dotStatus.setBackgroundColor(Color.parseColor("#94A3B8"));

        cardTargetInfo.setVisibility(View.GONE);
        if (cardDiscoveredPc != null) {
            cardDiscoveredPc.setVisibility(View.GONE);
        }
        if (btnLinkDiscovered != null) {
            btnLinkDiscovered.setText("⚡ 1-TAP LINK THIS PC");
            btnLinkDiscovered.setEnabled(true);
        }
    }

    private void checkBatteryOptimization() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                android.os.PowerManager pm = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                    appendLog("⚠️ Notice: For 24/7 continuous relay, disable battery optimization for this app in Android settings.");
                }
            } catch (Exception ignored) {}
        }
    }

    private void scanLocalNetwork() {
        appendLog("🔍 Scanning local Wi-Fi network for PC agents...");
        btnScanLan.setEnabled(false);
        btnScanLan.setText("SCANNING...");

        new Thread(new Runnable() {
            @Override
            public void run() {
                boolean foundViaUdp = false;
                try {
                    java.net.DatagramSocket socket = new java.net.DatagramSocket();
                    socket.setBroadcast(true);
                    socket.setSoTimeout(2500);

                    byte[] probe = "NEXUS_DISCOVERY_PING".getBytes();
                    socket.send(new java.net.DatagramPacket(probe, probe.length, java.net.InetAddress.getByName("255.255.255.255"), 48888));
                    try {
                        socket.send(new java.net.DatagramPacket(probe, probe.length, java.net.InetAddress.getByName("192.168.100.255"), 48888));
                    } catch (Exception ignored) {}

                    byte[] buf = new byte[2048];
                    java.net.DatagramPacket responsePacket = new java.net.DatagramPacket(buf, buf.length);
                    socket.receive(responsePacket);

                    String responseStr = new String(responsePacket.getData(), 0, responsePacket.getLength());
                    JSONObject json = new JSONObject(responseStr);
                    socket.close();

                    final String host = json.optString("hostname", "Nexus-PC");
                    final String ip = json.optString("ip", responsePacket.getAddress().getHostAddress());
                    final String mac = json.optString("mac", "");
                    final String pin = json.optString("pairCode", "");
                    final String key = json.optString("agentKey", "");

                    if (!ip.isEmpty() || !mac.isEmpty()) {
                        foundViaUdp = true;
                        discoveredHostname = host;
                        discoveredIp = ip;
                        discoveredMac = mac;
                        discoveredPin = pin;
                        discoveredAgentKey = key;

                        SharedPreferences currentPrefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE);
                        final boolean alreadyPaired = currentPrefs.getBoolean("paired", false);

                        mainHandler.post(new Runnable() {
                            @Override
                            public void run() {
                                btnScanLan.setEnabled(true);
                                btnScanLan.setText("🔍 SCAN WI-FI");
                                if (!alreadyPaired) {
                                    cardDiscoveredPc.setVisibility(View.VISIBLE);
                                    btnLinkDiscovered.setText("⚡ 1-TAP LINK THIS PC");
                                    btnLinkDiscovered.setEnabled(true);
                                    tvDiscoveredName.setText("💻 " + host + " (Found on Local Wi-Fi)");
                                    tvDiscoveredIp.setText("IP: " + ip + " • MAC: " + mac);
                                }
                                appendLog("🎉 Found local PC: " + host + " at " + ip + " (MAC: " + mac + ")!");
                            }
                        });
                    }
                } catch (Exception ignored) {}

                if (!foundViaUdp) {
                    probeSubnetHttp();
                }
            }
        }).start();
    }

    private void probeSubnetHttp() {
        String[] candidateIps = new String[]{"192.168.100.50", "192.168.1.50", "192.168.0.50", "127.0.0.1"};
        boolean found = false;

        for (final String ip : candidateIps) {
            try {
                Request req = new Request.Builder().url("http://" + ip + ":48880/api/pairing").build();
                Response resp = httpClient.newCall(req).execute();
                if (resp.isSuccessful() && resp.body() != null) {
                    JSONObject json = new JSONObject(resp.body().string());
                    final String host = json.optString("hostname", "PC");
                    final String mac = json.optString("mac", "");
                    final String pin = json.optString("pairCode", "");
                    final String key = json.optString("agentKey", "");

                    discoveredHostname = host;
                    discoveredIp = ip;
                    discoveredMac = mac;
                    discoveredPin = pin;
                    discoveredAgentKey = key;
                    found = true;

                    SharedPreferences currentPrefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE);
                    final boolean alreadyPaired = currentPrefs.getBoolean("paired", false);

                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            btnScanLan.setEnabled(true);
                            btnScanLan.setText("🔍 SCAN WI-FI");
                            if (!alreadyPaired) {
                                cardDiscoveredPc.setVisibility(View.VISIBLE);
                                btnLinkDiscovered.setText("⚡ 1-TAP LINK THIS PC");
                                btnLinkDiscovered.setEnabled(true);
                                tvDiscoveredName.setText("💻 " + host + " (Found on Local Wi-Fi)");
                                tvDiscoveredIp.setText("IP: " + ip + " • MAC: " + mac);
                            }
                            appendLog("🎉 Found local PC: " + host + " at " + ip + " (MAC: " + mac + ")!");
                        }
                    });
                    break;
                }
            } catch (Exception ignored) {}
        }

        if (!found) {
            mainHandler.post(new Runnable() {
                @Override
                public void run() {
                    btnScanLan.setEnabled(true);
                    btnScanLan.setText("🔍 SCAN WI-FI");
                    appendLog("ℹ️ No new PC agents discovered yet. You can tap 'Scan Wi-Fi' to refresh.");
                }
            });
        }
    }

    private void linkDiscoveredPcDirectly() {
        if (discoveredIp.isEmpty() && discoveredMac.isEmpty()) {
            Toast.makeText(this, "No PC discovered to link", Toast.LENGTH_SHORT).show();
            return;
        }

        String pin = !discoveredPin.isEmpty() ? discoveredPin : "746255";
        String roomId = "room_" + pin + "_pc";
        String token = "token_" + pin;

        SharedPreferences prefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE);
        prefs.edit()
                .putBoolean("paired", true)
                .putString("currentPin", pin)
                .putString("roomId", roomId)
                .putString("token", token)
                .putString("targetMac", discoveredMac)
                .putString("targetIp", discoveredIp)
                .putString("hostname", discoveredHostname)
                .putString("agentKey", discoveredAgentKey)
                .apply();

        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().subscribeToTopic("nexus_" + pin);
        } catch (Exception ignored) {}

        btnLinkDiscovered.setText("LINKED!");
        btnLinkDiscovered.setEnabled(false);
        updateUiPaired(discoveredHostname, discoveredMac, discoveredIp);
        appendLog("✅ 1-Tap Linked with " + discoveredHostname + " (" + discoveredIp + ")!");
        Toast.makeText(this, "Linked with " + discoveredHostname + "!", Toast.LENGTH_SHORT).show();

        RelayService.startService(this, roomId, token, discoveredMac, discoveredIp, relayUrl);
    }
}
