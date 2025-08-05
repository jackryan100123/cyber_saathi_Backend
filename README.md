# CyberSaathi Backend

This is the Node.js Express backend for the CyberSaathi app. It securely proxies chat requests to the Groq API and keeps the API key hidden from the frontend.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create a `.env` file:**
   Copy the example and add your Groq API key:
   ```bash
   cp .env.example .env
   # Then edit .env and set GROQ_API_KEY=your-key-here
   ```

3. **Run the server:**
   ```bash
   npm start
   ```

## Environment Variables
- `GROQ_API_KEY`: Your Groq API key (kept secret in the backend)

## Endpoints

### POST `/chat`
- **Request body:**
  ```json
  {
    "messages": [
      { "role": "user", "content": "How do I report a cyber crime?" }
    ]
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "response": "...AI reply..."
  }
  ```

## Security
- The Groq API key is never exposed to the frontend.
- The `.env` file is gitignored by default.