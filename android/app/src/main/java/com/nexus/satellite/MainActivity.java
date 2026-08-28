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

    private EditText etPin;
    private Button btnConnect;
    private TextView tvStatus;
    private View dotStatus;
    private LinearLayout cardTargetInfo;
    private TextView tvTargetName;
    private TextView tvTargetIp;
    private TextView tvTargetMac;

    // Direct LAN Control Buttons
    private Button btnTestPing;
    private Button btnTestWol;
    private Button btnTestLock;
    private Button btnTestUnlock;
    private Button btnTestSleep;
    private Button btnTestRestart;

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

        etPin = findViewById(R.id.etPin);
        btnConnect = findViewById(R.id.btnConnect);
        tvStatus = findViewById(R.id.tvStatus);
        dotStatus = findViewById(R.id.dotStatus);
        cardTargetInfo = findViewById(R.id.cardTargetInfo);
        tvTargetName = findViewById(R.id.tvTargetName);
        tvTargetIp = findViewById(R.id.tvTargetIp);
        tvTargetMac = findViewById(R.id.tvTargetMac);

        btnTestPing = findViewById(R.id.btnTestPing);
        btnTestWol = findViewById(R.id.btnTestWol);
        btnTestLock = findViewById(R.id.btnTestLock);
        btnTestUnlock = findViewById(R.id.btnTestUnlock);
        btnTestSleep = findViewById(R.id.btnTestSleep);
        btnTestRestart = findViewById(R.id.btnTestRestart);

        tvLogs = findViewById(R.id.tvLogs);
        scrollLogs = findViewById(R.id.scrollLogs);
        btnClearLogs = findViewById(R.id.btnClearLogs);

        NexusFirebaseMessagingService.subscribeToCurrentTopic(this);
        loadSavedState();
        checkBatteryOptimization();

        android.content.BroadcastReceiver logReceiver = new android.content.BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent != null && intent.hasExtra("log")) {
                    appendLog(intent.getStringExtra("log"));
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

            @Override
            public void onClick(View v) {
                String pin = etPin.getText().toString().trim().replaceAll("[^0-9]", "");
                if (pin.length() != 6) {
                    Toast.makeText(MainActivity.this, "Please enter a valid 6-digit PIN", Toast.LENGTH_SHORT).show();
                    return;
                }
                claimPinAndStartService(pin, 1);
            }
        });

        // 1. Direct LAN Ping & Health Check
        btnTestPing.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                executeLanAction("Ping & Health Check", "/api/status", "GET", null);
            }
        });

        // 2. Direct LAN Wake-on-LAN
        btnTestWol.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                SharedPreferences prefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE);
                final String mac = prefs.getString("targetMac", "");
                if (mac == null || mac.isEmpty()) {
                    appendLog("❌ No PC linked. Please enter a valid 6-digit PIN above first.");
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

        if (ip == null || ip.isEmpty()) {
            appendLog("❌ Cannot execute [" + actionName + "]: Satellite is not linked to any PC. Enter a valid 6-digit PIN above first.");
            Toast.makeText(MainActivity.this, "Please pair with a PC first", Toast.LENGTH_SHORT).show();
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

    private void claimPinAndStartService(final String pin, final int attempt) {
        btnConnect.setEnabled(false);
        btnConnect.setText(attempt > 1 ? "RETRYING (" + attempt + "/3)..." : "CONNECTING...");
        appendLog("🔗 Claiming PIN [" + pin + "] from Cloud Relay (Attempt " + attempt + "/3)...");

        try {
            JSONObject json = new JSONObject();
            json.put("pairCode", pin);
            MediaType mediaType = MediaType.parse("application/json; charset=utf-8");
            RequestBody body = RequestBody.create(mediaType, json.toString());
            Request request = new Request.Builder()
                    .url(relayUrl + "/api/pair/claim")
                    .addHeader("User-Agent", "Nexus-Android-Satellite/3.8.3")
                    .post(body)
                    .build();

            httpClient.newCall(request).enqueue(new Callback() {
                @Override
                public void onFailure(Call call, final IOException e) {
                    if (attempt < 3) {
                        mainHandler.postDelayed(new Runnable() {
                            @Override
                            public void run() {
                                claimPinAndStartService(pin, attempt + 1);
                            }
                        }, 1500);
                        return;
                    }
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            btnConnect.setEnabled(true);
                            btnConnect.setText("CONNECT & START 24/7 RELAY");
                            appendLog("❌ Pairing Network Error: " + e.getMessage());
                            Toast.makeText(MainActivity.this, "Network error: " + e.getMessage(), Toast.LENGTH_LONG).show();
                        }
                    });
                }

                @Override
                public void onResponse(Call call, Response response) throws IOException {
                    final String resStr = response.body() != null ? response.body().string() : "";
                    try {
                        final JSONObject resJson = new JSONObject(resStr);
                        if (resJson.optBoolean("success", false)) {
                            final String roomId = resJson.getString("roomId");
                            final String token = resJson.getString("token");
                            final String targetMac = resJson.optString("targetMac", "");
                            final String targetIp = resJson.optString("targetIp", "");
                            final String hostname = resJson.optString("hostname", "PC");
                            final String agentKey = resJson.optString("agentKey", "");

                            SharedPreferences prefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE);
                            String oldPin = prefs.getString("currentPin", "");
                            if (oldPin != null && !oldPin.isEmpty()) {
                                try {
                                    com.google.firebase.messaging.FirebaseMessaging.getInstance().unsubscribeFromTopic("nexus_" + oldPin);
                                } catch (Exception ignored) {}
                            }
                            try {
                                com.google.firebase.messaging.FirebaseMessaging.getInstance().subscribeToTopic("nexus_" + pin);
                                appendLog("📡 Subscribed to private FCM topic: nexus_" + pin);
                            } catch (Exception ignored) {}

                            prefs.edit()
                                    .putBoolean("paired", true)
                                    .putString("currentPin", pin)
                                    .putString("roomId", roomId)
                                    .putString("token", token)
                                    .putString("targetMac", targetMac)
                                    .putString("targetIp", targetIp)
                                    .putString("hostname", hostname)
                                    .putString("agentKey", agentKey)
                                    .apply();

                            mainHandler.post(new Runnable() {
                                @Override
                                public void run() {
                                    btnConnect.setEnabled(true);
                                    btnConnect.setText("CONNECTED & ACTIVE");
                                    updateUiPaired(hostname, targetMac, targetIp);
                                    appendLog("🎉 Successfully paired with " + hostname + " (IP: " + targetIp + ")!");
                                    Toast.makeText(MainActivity.this, "Linked with " + hostname + "!", Toast.LENGTH_SHORT).show();
                                }
                            });

                            RelayService.startService(MainActivity.this, roomId, token, targetMac, targetIp, relayUrl);
                        } else {
                            if (attempt < 3 && (resStr.contains("not found") || resStr.contains("offline"))) {
                                mainHandler.postDelayed(new Runnable() {
                                    @Override
                                    public void run() {
                                        claimPinAndStartService(pin, attempt + 1);
                                    }
                                }, 1500);
                                return;
                            }
                            final String errorMsg = resJson.optString("error", "Invalid or unregistered Pairing PIN.");
                            mainHandler.post(new Runnable() {
                                @Override
                                public void run() {
                                    btnConnect.setEnabled(true);
                                    btnConnect.setText("CONNECT & START 24/7 RELAY");
                                    appendLog("❌ Pairing Failed: " + errorMsg);
                                    Toast.makeText(MainActivity.this, errorMsg, Toast.LENGTH_LONG).show();
                                }
                            });
                        }
                    } catch (Exception e) {
                        mainHandler.post(new Runnable() {
                            @Override
                            public void run() {
                                btnConnect.setEnabled(true);
                                btnConnect.setText("CONNECT & START 24/7 RELAY");
                                appendLog("❌ JSON Parse Error: " + e.getMessage());
                                Toast.makeText(MainActivity.this, "Invalid response from server", Toast.LENGTH_LONG).show();
                            }
                        });
                    }
                }
            });
        } catch (Exception e) {
            btnConnect.setEnabled(true);
            btnConnect.setText("CONNECT & START 24/7 RELAY");
            appendLog("❌ General Error: " + e.getMessage());
            Toast.makeText(this, "Error: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    private void updateUiPaired(String hostname, String mac, String ip) {
        tvStatus.setText("ONLINE • 24/7 HOME RELAY & LAN SUITE");
        tvStatus.setTextColor(Color.parseColor("#10B981"));
        dotStatus.setBackgroundColor(Color.parseColor("#10B981"));

        cardTargetInfo.setVisibility(View.VISIBLE);
        tvTargetName.setText("Target: " + (hostname.isEmpty() ? "PC" : hostname));
        tvTargetIp.setText("LAN IP: " + ip + ":48880");
        tvTargetMac.setText("Target MAC: " + mac);
    }

    private void updateUiUnpaired() {
        tvStatus.setText("NOT PAIRED • ENTER 6-DIGIT PIN");
        tvStatus.setTextColor(Color.parseColor("#94A3B8"));
        dotStatus.setBackgroundColor(Color.parseColor("#94A3B8"));

        cardTargetInfo.setVisibility(View.GONE);
        tvTargetName.setText("Target: No PC Linked");
        tvTargetIp.setText("LAN IP: Not Linked");
        tvTargetMac.setText("Target MAC: Not Linked");
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
}
