const sdk = require('microsoft-cognitiveservices-speech-sdk');
const { getAzureSpeechToken, formatTokenForTts, AZURE_SPEECH_REGION } = require('./azure-speech-token');

async function synthesizeSpeech(text) {
  if (!text?.trim()) throw new Error('[TTS] text is empty');

  // Get token via SP (local) or MI (prod) — handled in azure-speech-token.js
  let aadToken;
  try {
    aadToken = await getAzureSpeechToken();
    console.log('[TTS] ✅ Token acquired');
  } catch (err) {
    console.error('[TTS] ❌ Token failed — check SP creds (local) or MI config (prod):', err.message);
    throw err;
  }

  // Format token for TTS (aad#resourceId#token)
  let authToken;
  try {
    authToken = formatTokenForTts(aadToken);
    console.log('[TTS] ✅ Auth token formatted, region:', AZURE_SPEECH_REGION);
  } catch (err) {
    console.error('[TTS] ❌ formatTokenForTts failed:', err.message);
    throw err;
  }

  // Build SpeechConfig
  const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(authToken, AZURE_SPEECH_REGION);
  speechConfig.speechSynthesisVoiceName = 'en-IN-NeerjaNeural';
  speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm;

  const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
  console.log('[TTS] 🔄 Synthesizing', text.trim().length, 'chars...');

  const synthesisPromise = new Promise((resolve, reject) => {
    synthesizer.speakTextAsync(
      text.trim(),
      (result) => {
        synthesizer.close();
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          console.log('[TTS] ✅ Done —', result.audioData.byteLength, 'bytes');
          resolve(Buffer.from(result.audioData));
        } else {
          const c = sdk.CancellationDetails.fromResult(result);
          console.error('[TTS] ❌ Canceled:', c.errorDetails);
          if (c.errorDetails?.includes('403')) console.error('[TTS] 403 → SP/MI missing "Cognitive Services User" role');
          if (c.errorDetails?.includes('401')) console.error('[TTS] 401 → Wrong RESOURCE_ID or bad token');
          reject(new Error(`TTS canceled: ${c.errorDetails}`));
        }
      },
      (err) => {
        synthesizer.close();
        console.error('[TTS] ❌ SDK error:', err);
        reject(new Error(String(err)));
      }
    );
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => {
      synthesizer.close();
      console.error('[TTS] ❌ TIMEOUT 60s — network/VPN issue');
      reject(new Error('TTS timed out after 60s'));
    }, 60000)
  );

  return Promise.race([synthesisPromise, timeoutPromise]);
}

module.exports = { synthesizeSpeech };