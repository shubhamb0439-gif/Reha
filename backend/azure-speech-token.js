// azure-speech-token.js
// Token-based authentication for Azure Cognitive Services Speech API
// Implements Service Principal → Managed Identity fallback logic
// Region: centralindia
// NO API KEYS - token-based auth only

const { ClientSecretCredential, ManagedIdentityCredential } = require('@azure/identity');

const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || 'centralindia';
const AZURE_SPEECH_RESOURCE_ID = process.env.AZURE_SPEECH_RESOURCE_ID || '';
const SPEECH_SCOPE = 'https://cognitiveservices.azure.com/.default';

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Get Azure Speech API access token with SP→MI fallback
 * @returns {Promise<string>} Access token
 */
async function getAzureSpeechToken() {
  // Return cached token if still valid (with 2 min buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 120000) {
    return cachedToken;
  }

  let credential = null;

  // Auth env vars
  const clientId     = process.env.DB_CLIENT_ID;
  const clientSecret = process.env.DB_CLIENT_SECRET;
  const tenantId     = process.env.DB_TENANT_ID;
  const miClientId   = process.env.AZURE_CLIENT_ID_MI; // User-Assigned Managed Identity

  if (clientId && clientSecret && tenantId) {
    // LOCAL: Service Principal authentication
    console.log('[AZURE-SPEECH-TOKEN] 🔑 Auth Mode  : Service Principal');
    console.log('[AZURE-SPEECH-TOKEN]   DB_CLIENT_ID     ✅ set');
    console.log('[AZURE-SPEECH-TOKEN]   DB_CLIENT_SECRET ✅ set');
    console.log('[AZURE-SPEECH-TOKEN]   DB_TENANT_ID     ✅ set');
    credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

  } else if (miClientId) {
    // PRODUCTION: User-Assigned Managed Identity
    console.log('[AZURE-SPEECH-TOKEN] 🔑 Auth Mode  : User-Assigned Managed Identity');
    console.log('[AZURE-SPEECH-TOKEN]   AZURE_CLIENT_ID_MI ✅ set');
    credential = new ManagedIdentityCredential({ clientId: miClientId });

  } else {
    // Last resort: System-Assigned MI (will likely fail if you have user-assigned MI)
    console.warn('[AZURE-SPEECH-TOKEN] ⚠️  Auth Mode  : System-Assigned MI (AZURE_CLIENT_ID_MI not set — may fail!)');
    credential = new ManagedIdentityCredential();
  }

  try {
    const tokenResponse = await credential.getToken(SPEECH_SCOPE);

    if (!tokenResponse || !tokenResponse.token) {
      throw new Error('Empty token received from Azure Identity');
    }

    cachedToken = tokenResponse.token;
    tokenExpiresAt = tokenResponse.expiresOnTimestamp;

    console.log('[AZURE-SPEECH-TOKEN] ✅ Token acquired successfully');
    return cachedToken;
  } catch (error) {
    console.error('[AZURE-SPEECH-TOKEN] ❌ Failed to acquire token:', error.message);
    throw new Error(`Azure Speech token acquisition failed: ${error.message}`);
  }
}

/**
 * Format AAD token for TTS WebSocket authentication.
 * Azure Speech SDK TTS WebSocket REQUIRES: aad#<resourceId>#<rawToken>
 * This is mandatory when using SP/MI (no API key) with TTS.
 *
 * @param {string} aadToken - Raw AAD OAuth2 token from SP/MI auth
 * @returns {string} Formatted TTS token
 */
function formatTokenForTts(aadToken) {
  if (!AZURE_SPEECH_RESOURCE_ID) {
    throw new Error(
      'AZURE_SPEECH_RESOURCE_ID is not set. ' +
      'Find it in Azure Portal → Speech resource → Properties → Resource ID. ' +
      'Format: /subscriptions/<id>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<name>'
    );
  }
  return `aad#${AZURE_SPEECH_RESOURCE_ID}#${aadToken}`;
}

/**
 * Verify Azure Speech connectivity by acquiring a token
 * @returns {Promise<boolean>}
 */
async function verifyAzureSpeechConnectivity() {
  try {
    await getAzureSpeechToken();
    console.log('✅ Azure Speech-to-Text and Text-to-Speech connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Azure Speech connectivity verification failed:', error.message);
    return false;
  }
}

module.exports = {
  getAzureSpeechToken,
  formatTokenForTts,
  verifyAzureSpeechConnectivity,
  AZURE_SPEECH_REGION
};