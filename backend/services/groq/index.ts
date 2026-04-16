import Groq from 'groq-sdk';
import 'dotenv/config';

export const groqService = {
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
  async transcribeAudio(tempFilePath: string, language: string, fs: any): Promise<string> {
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
  async chatCompletion({ messages, model = "llama-3.1-8b-instant", response_format = null }: { 
    messages: any[], 
    model?: string, 
    response_format?: string | null 
  }): Promise<string | null> {
    try {
      const response = await this.groq.chat.completions.create({
        model,
        messages,
        response_format: response_format ? { type: response_format as any } : undefined,
      });
      return response.choices[0].message.content;
    } catch (error) {
      console.error("[Groq] Chat error:", error);
      throw error;
    }
  }
};

export default groqService;
