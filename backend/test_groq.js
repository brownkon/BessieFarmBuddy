const Groq = require('groq-sdk');
require('dotenv').config();

async function testGroq() {
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  try {
    const chatCompletion = await client.chat.completions.create({
      messages: [{ role: 'user', content: 'Say hello' }],
      model: 'llama-3.1-8b-instant',
    });
    console.log('GROQ_RESPONSE:', chatCompletion.choices[0].message.content);
  } catch (err) {
    console.error('GROQ_ERROR:', err.message);
  }
}

testGroq();
