const Groq = require('groq-sdk');
require('dotenv').config();

const service = {
  groq: new Groq({
    apiKey: process.env.GROQ_API_KEY,
  }),

  /**
   * Transcribe audio using Groq's Whisper API
   * @param {string} tempFilePath - Absolute path to audio file
   * @param {string} language - ISO 639-1 language code
   * @param {object} fs - File system module
   * @returns {Promise<string>} - Transcribed text
   */
  async transcribeAudio(tempFilePath, language, fs) {
    try {
      const transcription = await this.groq.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: "whisper-large-v3", // Best available on Groq
        language: language,
        response_format: "json",
      });
      return transcription.text || "";
    } catch (error) {
      console.error("[Groq] Transcription error:", error);
      throw error;
    }
  },

  /**
   * Fast chat completion for routing/classification
   */
  async chatCompletion({ messages, model = "llama-3.1-8b-instant", response_format = null }) {
    try {
      const response = await this.groq.chat.completions.create({
        model,
        messages,
        response_format: response_format ? { type: response_format } : undefined,
      });
      return response.choices[0].message.content;
    } catch (error) {
      console.error("[Groq] Chat error:", error);
      throw error;
    }
  }
};

module.exports = service;
