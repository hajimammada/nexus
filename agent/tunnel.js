// Nexus Remote Tunnel Launcher
// Creates a secure public Cloudflare Tunnel for Nexus Agent to allow remote sleep/restart/shutdown from anywhere.

const { startTunnel } = require('untun');
const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const PORT = process.env.PORT || 48880;

async function run() {
  console.log('================================================================');
  console.log('🌐 Starting Nexus PC Agent + Secure Cloudflare Remote Tunnel...');
  console.log('================================================================');

  // Start the server if not already running
  require('./server.js');

  try {
    const tunnel = await startTunnel({ port: PORT });
    const tunnelUrl = await tunnel.getURL();

    console.log('\n================================================================');
    console.log('🎉 REMOTE ACCESS READY (Control your PC from anywhere in the world)!');
    console.log('================================================================');
    console.log(`🔗 Public Secure URL: ${tunnelUrl}`);
    console.log(`🔑 Secret Key:       ${process.env.AGENT_KEY ? '(Configured in .env)' : 'NOT SET'}`);
    console.log('\n📋 INSTRUCTIONS:');
    console.log('1. Open your Nexus Dashboard on any device (phone, laptop, iPad).');
    console.log('2. Go to Settings -> PC Power & Webhooks.');
    console.log(`3. Paste "${tunnelUrl}" into "Nexus PC Agent URL".`);
    console.log('4. You can now Sleep, Restart, or Shut Down this PC from ANYWHERE!');
    console.log('================================================================\n');
  } catch (err) {
    console.error('Failed to establish Cloudflare Tunnel:', err.message);
  }
}

run();
