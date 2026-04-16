import Groq from 'groq-sdk';
import 'dotenv/config';

async function testGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('GROQ_API_KEY not found in environment');
    return;
  }
  const client = new Groq({ apiKey });
  try {
    const chatCompletion = await client.chat.completions.create({
      messages: [{ role: 'user', content: 'Say hello' }],
      model: 'llama-3.1-8b-instant',
    });
    console.log('GROQ_RESPONSE:', chatCompletion.choices[0].message.content || 'No content');
  } catch (err: any) {
    console.error('GROQ_ERROR:', err.message);
  }
}

testGroq();
