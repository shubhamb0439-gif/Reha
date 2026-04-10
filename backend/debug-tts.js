// debug-tts.js — run once to diagnose TTS 403 issue
// node debug-tts.js

require('./config/env-loader');
const https = require('https');
const { ClientSecretCredential } = require('@azure/identity');

const CUSTOM_DOMAIN = process.env.AZURE_SPEECH_CUSTOM_DOMAIN || 'osss-speech-ss';
const REGION = process.env.AZURE_SPEECH_REGION || 'centralindia';
const clientId = process.env.DB_CLIENT_ID;
const clientSecret = process.env.DB_CLIENT_SECRET;
const tenantId = process.env.DB_TENANT_ID;

console.log('\n========== TTS DEBUG ==========');
console.log('CUSTOM_DOMAIN :', CUSTOM_DOMAIN);
console.log('REGION        :', REGION);
console.log('DB_CLIENT_ID  :', clientId ? '✅ set' : '❌ MISSING');
console.log('DB_CLIENT_SECRET:', clientSecret ? '✅ set' : '❌ MISSING');
console.log('DB_TENANT_ID  :', tenantId ? '✅ set' : '❌ MISSING');
console.log('================================\n');

async function run() {
  // Step 1: Get AAD token
  console.log('[1] Getting AAD token via SP...');
  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  const tokenResponse = await credential.getToken('https://cognitiveservices.azure.com/.default');
  const aadToken = tokenResponse.token;
  console.log('[1] ✅ AAD token acquired');
  console.log('    Expires:', new Date(tokenResponse.expiresOnTimestamp).toISOString());
  console.log('    Token preview:', aadToken.substring(0, 40) + '...\n');

  // Step 2: Try token exchange via custom domain
  console.log(`[2] Exchanging token at https://${CUSTOM_DOMAIN}.cognitiveservices.azure.com/sts/v1.0/issueToken`);
  
  await new Promise((resolve) => {
    const options = {
      hostname: `${CUSTOM_DOMAIN}.cognitiveservices.azure.com`,
      path: '/sts/v1.0/issueToken',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aadToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': 0
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        console.log(`[2] HTTP Status: ${res.statusCode}`);
        if (res.statusCode === 200) {
          console.log('[2] ✅ Speech token obtained successfully!');
          console.log('    Token preview:', data.substring(0, 40) + '...');
          console.log('\n✅ TTS WILL WORK — all good!');
        } else {
          console.log('[2] ❌ Failed:', data);
          console.log('\n--- DIAGNOSIS ---');
          if (res.statusCode === 403) {
            console.log('❌ 403 = VNet is blocking this machine');
            console.log('   Your machine IP is not inside the allowed VNet/subnet');
            console.log('   Fix: Ask Azure admin to whitelist this server IP in Speech resource Networking');
          } else if (res.statusCode === 401) {
            console.log('❌ 401 = SP does not have correct role on Speech resource');
            console.log('   Fix: Azure Portal → osss-speech-ss → IAM → Add "Cognitive Services User" role to your SP');
          } else if (res.statusCode === 400) {
            console.log('❌ 400 = Custom domain not enabled or wrong domain name');
          }
        }
        resolve();
      });
    });

    req.on('error', (err) => {
      console.log('[2] ❌ Network error:', err.message);
      console.log('   This machine cannot reach Azure at all — check internet/VPN');
      resolve();
    });

    req.end();
  });
} 

run().catch(console.error);