import express from 'express';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  throw new Error('GROQ_API_KEY is not set in environment variables');
}

app.use(cors());
app.use(express.json());

// System prompt for prompt engineering
const SYSTEM_PROMPT =
  "You are CyberSaathi, an official cybersecurity assistant for Indian users. Provide helpful, accurate information about cybersecurity, cyber crimes, and digital safety. Keep responses concise but informative. Always prioritize user safety and direct them to appropriate authorities when needed.";

// POST /chat endpoint
app.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid messages array' });
    }

    // Prepend the system prompt
    const groqMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

    // Call Groq API (assuming OpenAI-compatible endpoint)
    const groqResponse = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'mixtral-8x7b-32768',
        messages: groqMessages,
        max_tokens: 512,
        temperature: 0.7,
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const aiMessage = groqResponse.data.choices?.[0]?.message?.content || '';
    res.json({ success: true, response: aiMessage });
  } catch (error) {
    console.error('Chat error:', error?.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Failed to get response from AI assistant.' });
  }
});

app.listen(PORT, () => {
  console.log(`CyberSaathi backend running on port ${PORT}`);
});