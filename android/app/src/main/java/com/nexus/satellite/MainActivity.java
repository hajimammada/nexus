package com.nexus.satellite;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONObject;

import java.io.IOException;

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
    private TextView tvTargetMac;
    private TextView tvTargetIp;
    private Button btnTestWol;
    private Button btnTestUnlock;

    private final OkHttpClient httpClient = new OkHttpClient();
    private final String relayUrl = "https://nexus.hajimammad.com";

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
        tvTargetMac = findViewById(R.id.tvTargetMac);
        tvTargetIp = findViewById(R.id.tvTargetIp);
        btnTestWol = findViewById(R.id.btnTestWol);
        btnTestUnlock = findViewById(R.id.btnTestUnlock);

        loadSavedState();

        btnConnect.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String pin = etPin.getText().toString().trim().replace("-", "");
                if (pin.length() < 6) {
                    Toast.makeText(MainActivity.this, "Please enter a valid 6-digit PIN", Toast.LENGTH_SHORT).show();
                    return;
                }
                claimPinAndStartService(pin);
            }
        });

        btnTestWol.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                SharedPreferences prefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE);
                final String mac = prefs.getString("targetMac", "");
                if (mac != null && !mac.isEmpty()) {
                    new Thread(new Runnable() {
                        @Override
                        public void run() {
                            final boolean success = WolManager.sendWakeOnLan(MainActivity.this, mac);
                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    Toast.makeText(MainActivity.this, success ? "Magic packet sent!" : "Failed to send packet", Toast.LENGTH_SHORT).show();
                                }
                            });
                        }
                    }).start();
                } else {
                    Toast.makeText(MainActivity.this, "Pair device first", Toast.LENGTH_SHORT).show();
                }
            }
        });

        btnTestUnlock.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                SharedPreferences prefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE);
                final String ip = prefs.getString("targetIp", "");
                if (ip != null && !ip.isEmpty()) {
                    new Thread(new Runnable() {
                        @Override
                        public void run() {
                            final boolean success = SshUnlockManager.triggerUnlock(ip, 22);
                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    Toast.makeText(MainActivity.this, success ? "Unlock signal sent to " + ip : "Could not reach SSH port", Toast.LENGTH_SHORT).show();
                                }
                            });
                        }
                    }).start();
                } else {
                    Toast.makeText(MainActivity.this, "Pair device first", Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    private void loadSavedState() {
        SharedPreferences prefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE);
        boolean paired = prefs.getBoolean("paired", false);
        String mac = prefs.getString("targetMac", "");
        String ip = prefs.getString("targetIp", "");
        String hostname = prefs.getString("hostname", "Nexus-PC");
        String roomId = prefs.getString("roomId", "");
        String token = prefs.getString("token", "");

        if (paired && roomId != null && !roomId.isEmpty()) {
            updateUiPaired(hostname, mac, ip);
            RelayService.startService(this, roomId, token, mac, ip, relayUrl);
        }
    }

    private void claimPinAndStartService(String pin) {
        btnConnect.setEnabled(false);
        btnConnect.setText("CONNECTING...");

        try {
            JSONObject json = new JSONObject();
            json.put("pairCode", pin);
            MediaType mediaType = MediaType.parse("application/json; charset=utf-8");
            RequestBody body = RequestBody.create(mediaType, json.toString());
            Request request = new Request.Builder()
                    .url(relayUrl + "/api/pair/claim")
                    .post(body)
                    .build();

            httpClient.newCall(request).enqueue(new Callback() {
                @Override
                public void onFailure(Call call, final IOException e) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            btnConnect.setEnabled(true);
                            btnConnect.setText("CONNECT & START 24/7 RELAY");
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
                            final String hostname = resJson.optString("hostname", "Nexus-PC");

                            SharedPreferences prefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE);
                            prefs.edit()
                                    .putBoolean("paired", true)
                                    .putString("roomId", roomId)
                                    .putString("token", token)
                                    .putString("targetMac", targetMac)
                                    .putString("targetIp", targetIp)
                                    .putString("hostname", hostname)
                                    .apply();

                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    btnConnect.setEnabled(true);
                                    btnConnect.setText("CONNECTED & ACTIVE");
                                    updateUiPaired(hostname, targetMac, targetIp);
                                    Toast.makeText(MainActivity.this, "Successfully linked with " + hostname + "!", Toast.LENGTH_SHORT).show();
                                }
                            });

                            RelayService.startService(MainActivity.this, roomId, token, targetMac, targetIp, relayUrl);
                        } else {
                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    btnConnect.setEnabled(true);
                                    btnConnect.setText("CONNECT & START 24/7 RELAY");
                                    Toast.makeText(MainActivity.this, resJson.optString("error", "Pairing failed"), Toast.LENGTH_LONG).show();
                                }
                            });
                        }
                    } catch (Exception e) {
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                btnConnect.setEnabled(true);
                                btnConnect.setText("CONNECT & START 24/7 RELAY");
                                Toast.makeText(MainActivity.this, "Invalid response from server", Toast.LENGTH_LONG).show();
                            }
                        });
                    }
                }
            });
        } catch (Exception e) {
            btnConnect.setEnabled(true);
            btnConnect.setText("CONNECT & START 24/7 RELAY");
            Toast.makeText(this, "Error: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    private void updateUiPaired(String hostname, String mac, String ip) {
        tvStatus.setText("ONLINE • 24/7 HOME RELAY ACTIVE");
        tvStatus.setTextColor(Color.parseColor("#10B981"));
        dotStatus.setBackgroundColor(Color.parseColor("#10B981"));

        cardTargetInfo.setVisibility(View.VISIBLE);
        tvTargetName.setText("Target: " + hostname);
        tvTargetMac.setText("Target MAC: " + mac);
        tvTargetIp.setText("Target IP: " + ip);
    }
}
