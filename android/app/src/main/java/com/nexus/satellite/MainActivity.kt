package com.nexus.satellite

import android.content.Context
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException

class MainActivity : AppCompatActivity() {

    private lateinit var etPin: EditText
    private lateinit var btnConnect: Button
    private lateinit var tvStatus: TextView
    private lateinit var dotStatus: View
    private lateinit var cardTargetInfo: LinearLayout
    private lateinit var tvTargetName: TextView
    private lateinit var tvTargetMac: TextView
    private lateinit var tvTargetIp: TextView
    private lateinit var btnTestWol: Button
    private lateinit var btnTestUnlock: Button

    private val httpClient = OkHttpClient()
    private val relayUrl = "https://nexus.hajimammad.com"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        etPin = findViewById(R.id.etPin)
        btnConnect = findViewById(R.id.btnConnect)
        tvStatus = findViewById(R.id.tvStatus)
        dotStatus = findViewById(R.id.dotStatus)
        cardTargetInfo = findViewById(R.id.cardTargetInfo)
        tvTargetName = findViewById(R.id.tvTargetName)
        tvTargetMac = findViewById(R.id.tvTargetMac)
        tvTargetIp = findViewById(R.id.tvTargetIp)
        btnTestWol = findViewById(R.id.btnTestWol)
        btnTestUnlock = findViewById(R.id.btnTestUnlock)

        loadSavedState()

        btnConnect.setOnClickListener {
            val pin = etPin.text.toString().trim().replace("-", "")
            if (pin.length < 6) {
                Toast.makeText(this, "Please enter a valid 6-digit PIN", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            claimPinAndStartService(pin)
        }

        btnTestWol.setOnClickListener {
            val prefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE)
            val mac = prefs.getString("targetMac", "") ?: ""
            if (mac.isNotEmpty()) {
                Thread {
                    val success = WolManager.sendWakeOnLan(this, mac)
                    runOnUiThread {
                        Toast.makeText(this, if (success) "Magic packet sent!" else "Failed to send packet", Toast.LENGTH_SHORT).show()
                    }
                }.start()
            } else {
                Toast.makeText(this, "Pair device first", Toast.LENGTH_SHORT).show()
            }
        }

        btnTestUnlock.setOnClickListener {
            val prefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE)
            val ip = prefs.getString("targetIp", "") ?: ""
            if (ip.isNotEmpty()) {
                Thread {
                    val success = SshUnlockManager.triggerUnlock(ip)
                    runOnUiThread {
                        Toast.makeText(this, if (success) "Unlock signal sent to $ip!" else "Could not reach SSH port", Toast.LENGTH_SHORT).show()
                    }
                }.start()
            } else {
                Toast.makeText(this, "Pair device first", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun loadSavedState() {
        val prefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE)
        val paired = prefs.getBoolean("paired", false)
        val mac = prefs.getString("targetMac", "") ?: ""
        val ip = prefs.getString("targetIp", "") ?: ""
        val hostname = prefs.getString("hostname", "Nexus-PC") ?: "Nexus-PC"
        val roomId = prefs.getString("roomId", "") ?: ""
        val token = prefs.getString("token", "") ?: ""

        if (paired && roomId.isNotEmpty()) {
            updateUiPaired(hostname, mac, ip)
            RelayService.startService(this, roomId, token, mac, ip, relayUrl)
        }
    }

    private fun claimPinAndStartService(pin: String) {
        btnConnect.isEnabled = false
        btnConnect.text = "CONNECTING..."

        val json = JSONObject().apply { put("pairCode", pin) }
        val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
        val request = Request.Builder().url("$relayUrl/api/pair/claim").post(body).build()

        httpClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                runOnUiThread {
                    btnConnect.isEnabled = true
                    btnConnect.text = "CONNECT & START 24/7 RELAY"
                    Toast.makeText(this@MainActivity, "Network error: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }

            override fun onResponse(call: Call, response: Response) {
                val resStr = response.body?.string() ?: ""
                try {
                    val resJson = JSONObject(resStr)
                    if (resJson.optBoolean("success", false)) {
                        val roomId = resJson.getString("roomId")
                        val token = resJson.getString("token")
                        val targetMac = resJson.optString("targetMac", "")
                        val targetIp = resJson.optString("targetIp", "")
                        val hostname = resJson.optString("hostname", "Nexus-PC")

                        val prefs = getSharedPreferences("NexusSatellitePrefs", Context.MODE_PRIVATE)
                        prefs.edit().apply {
                            putBoolean("paired", true)
                            putString("roomId", roomId)
                            putString("token", token)
                            putString("targetMac", targetMac)
                            putString("targetIp", targetIp)
                            putString("hostname", hostname)
                            apply()
                        }

                        runOnUiThread {
                            btnConnect.isEnabled = true
                            btnConnect.text = "CONNECTED & ACTIVE"
                            updateUiPaired(hostname, targetMac, targetIp)
                            Toast.makeText(this@MainActivity, "Successfully linked with $hostname!", Toast.LENGTH_SHORT).show()
                        }

                        RelayService.startService(this@MainActivity, roomId, token, targetMac, targetIp, relayUrl)
                    } else {
                        runOnUiThread {
                            btnConnect.isEnabled = true
                            btnConnect.text = "CONNECT & START 24/7 RELAY"
                            Toast.makeText(this@MainActivity, resJson.optString("error", "Pairing failed"), Toast.LENGTH_LONG).show()
                        }
                    }
                } catch (e: Exception) {
                    runOnUiThread {
                        btnConnect.isEnabled = true
                        btnConnect.text = "CONNECT & START 24/7 RELAY"
                        Toast.makeText(this@MainActivity, "Invalid response from server", Toast.LENGTH_LONG).show()
                    }
                }
            }
        })
    }

    private fun updateUiPaired(hostname: String, mac: String, ip: String) {
        tvStatus.text = "ONLINE • 24/7 HOME RELAY ACTIVE"
        tvStatus.setTextColor(Color.parseColor("#10B981"))
        dotStatus.setBackgroundColor(Color.parseColor("#10B981"))

        cardTargetInfo.visibility = View.VISIBLE
        tvTargetName.text = "Target: $hostname"
        tvTargetMac.text = "Target MAC: $mac"
        tvTargetIp.text = "Target IP: $ip"
    }
}
