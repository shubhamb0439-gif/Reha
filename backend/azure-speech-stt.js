// azure-speech-stt.js
// Azure Cognitive Services Speech-to-Text implementation
// Input: WAV audio buffer
// Highest quality recognition

const sdk = require('microsoft-cognitiveservices-speech-sdk');
const { getAzureSpeechToken, AZURE_SPEECH_REGION } = require('./azure-speech-token');

/**
 * Recognize speech from WAV audio buffer
 * @param {Buffer} audioBuffer - WAV audio data
 * @returns {Promise<string>} Transcribed text
 */
async function recognizeSpeech(audioBuffer) {
  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    throw new Error('Invalid input: audioBuffer must be a non-empty Buffer');
  }

  let recognizer = null;
  let pushStream = null;

  try {
    // Get authentication token
    const token = await getAzureSpeechToken();

    // Configure speech recognition
    const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(
      token,
      AZURE_SPEECH_REGION
    );

    speechConfig.speechRecognitionLanguage = 'en-US';
    speechConfig.enableDictation();

    // Optional stability/quality-related properties
    speechConfig.setProperty(
      sdk.PropertyId.SpeechServiceConnection_Region,
      AZURE_SPEECH_REGION
    );

    // Create push stream from buffer
    pushStream = sdk.AudioInputStream.createPushStream();
    pushStream.write(audioBuffer);
    pushStream.close();

    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);

    // Create recognizer
    recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    return await new Promise((resolve, reject) => {
      recognizer.recognizeOnceAsync(
        (result) => {
          try {
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
              const transcript = result.text || '';
              console.log(
                `[AZURE-STT] ✅ Recognized ${audioBuffer.length} bytes → "${transcript}"`
              );
              resolve(transcript);
            } else if (result.reason === sdk.ResultReason.NoMatch) {
              console.warn('[AZURE-STT] ⚠️ No speech recognized');
              resolve('');
            } else if (result.reason === sdk.ResultReason.Canceled) {
              const cancellation = sdk.CancellationDetails.fromResult(result);
              const reason =
                cancellation && cancellation.reason !== undefined
                  ? cancellation.reason
                  : 'Unknown';

              const details =
                cancellation && cancellation.errorDetails
                  ? cancellation.errorDetails
                  : 'No details';

              const errorMsg = `STT canceled: ${reason} - ${details}`;
              console.error('[AZURE-STT] ❌', errorMsg);
              reject(new Error(errorMsg));
            } else {
              const errorMsg = `STT failed with reason: ${result.reason}`;
              console.error('[AZURE-STT] ❌', errorMsg);
              reject(new Error(errorMsg));
            }
          } finally {
            if (recognizer) {
              recognizer.close();
              recognizer = null;
            }
          }
        },
        (error) => {
          if (recognizer) {
            recognizer.close();
            recognizer = null;
          }

          console.error('[AZURE-STT] ❌ Recognition error:', error);
          reject(
            error instanceof Error
              ? error
              : new Error(typeof error === 'string' ? error : 'Unknown STT error')
          );
        }
      );
    });
  } catch (error) {
    if (recognizer) {
      recognizer.close();
      recognizer = null;
    }

    console.error(
      '[AZURE-STT] ❌ Failed to recognize speech:',
      error?.message || error
    );
    throw error;
  }
}

module.exports = {
  recognizeSpeech
};