

# CyberSaathi Backend - In-Depth Analysis

## 📋 Project Overview

**CyberSaathi** is a Node.js Express backend application that serves as the official helpline chatbot for Chandigarh Cyber Police. It provides cybersecurity assistance, cybercrime guidance, and real-time cybercrime news aggregation.

### Key Features:
1. **AI-Powered Chatbot** - Uses Groq API with Llama 3.3 70B model
2. **News Aggregation** - Automated web scraping of cybersecurity news from major Indian news sources
3. **PDF Booklet Serving** - Serves educational PDFs about cybersecurity
4. **URL Scanning** - Placeholder endpoint for URL security scanning
5. **Health Monitoring** - System health and news status endpoints

---

## 🤖 Chatbot Working - Detailed Explanation

### Architecture Flow

```
User Message → Frontend → POST /chat → Backend Processing → Groq API → Response Cleaning → User
```

### Step-by-Step Process

#### 1. **Request Reception** (Lines 690-695)
```javascript
app.post('/chat', async (req, res) => {
  const { messages } = req.body;
  // Validates messages array
})
```

#### 2. **API Key Validation** (Lines 697-703)
- Checks if `GROQ_API_KEY` exists and is valid
- Returns maintenance message if API key is missing

#### 3. **Message Preparation** (Lines 705-709)
```javascript
const groqMessages = [
  { role: 'system', content: SYSTEM_PROMPT },  // System prompt prepended
  ...messages,                                   // User conversation history
];
```

#### 4. **API Call to Groq** (Lines 712-728)
- **Endpoint**: `https://api.groq.com/openai/v1/chat/completions`
- **Model**: `llama-3.3-70b-versatile`
- **Parameters**:
  - `max_tokens: 1024` - Limits response length
  - `temperature: 0.3` - Low temperature for focused, consistent responses
  - `top_p: 0.9` - Nucleus sampling parameter
  - `stream: false` - Non-streaming responses

#### 5. **Response Cleaning** (Lines 730-731)
- Removes internal reasoning tags (`<think>`)
- Strips XML-like tags
- Cleans whitespace and newlines
- Fixes third-person references

#### 6. **Response Delivery** (Line 733)
Returns cleaned response to frontend

---

## 💬 Example Chatbot Interactions

### Example 1: UPI Fraud Report

**User Input:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Someone transferred money from my UPI account without my permission. What should I do?"
    }
  ]
}
```

**Expected Response Flow:**
1. System prompt identifies this as a cybercrime victim scenario
2. Response starts with: "🚨 URGENT: Call 1930 or file complaint at cybercrime.gov.in immediately"
3. Provides immediate action steps
4. Lists key steps (5-6 bullet points)
5. Includes prevention tips
6. Mentions scam type: "UPI Fraud" or "Unauthorized Transaction"

**Sample Response:**
```
🚨 URGENT: Call 1930 or file complaint at cybercrime.gov.in immediately

Immediate Actions:
• Block your UPI account immediately through your bank app
• Contact your bank's fraud helpline
• Change all banking passwords and PINs

Key Steps:
• File FIR at nearest cyber police station
• Report to cybercrime.gov.in with transaction details
• Collect transaction IDs, timestamps, and recipient details
• Screenshot all related messages and emails
• Inform your bank to freeze the account if needed
• Keep all evidence for police investigation

Prevention Tip: Never share OTP, UPI PIN, or banking credentials. Enable transaction alerts and use biometric authentication.

Helpline: 1930 or 0172-2749900
```

### Example 2: Phishing Awareness Query

**User Input:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "I received an email saying my account will be suspended. Is this a scam?"
    }
  ]
}
```

**Expected Response:**
- Identifies as phishing attempt
- Explains red flags
- Provides verification steps
- Prevention tips

### Example 3: Off-Topic Query

**User Input:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "What's the weather today?"
    }
  ]
}
```

**Expected Response:**
```
I'm CyberSaathi - I only help with cybercrime and digital safety questions.
```

---

## 🧠 Model Details

### Model: Llama 3.3 70B Versatile

**Provider**: Groq API
**Model Name**: `llama-3.3-70b-versatile`
**Architecture**: Large Language Model (70 billion parameters)

### Model Characteristics:

1. **Versatile Capability**
   - General-purpose language understanding
   - Strong reasoning abilities
   - Good at following instructions

2. **Performance Parameters** (Lines 715-720):
   ```javascript
   {
     model: 'llama-3.3-70b-versatile',
     max_tokens: 1024,        // Response length limit
     temperature: 0.3,        // Low = more focused, deterministic
     top_p: 0.9,              // Nucleus sampling
     stream: false            // Complete response at once
   }
   ```

3. **Why This Model?**
   - **Fast Inference**: Groq provides ultra-fast inference speeds
   - **Cost-Effective**: Lower cost than OpenAI GPT models
   - **Good Instruction Following**: Responds well to system prompts
   - **Balanced Performance**: 70B parameters provide good quality without excessive cost

### Temperature Setting (0.3) - Why Low?

- **Lower Temperature (0.3)** = More deterministic, focused responses
- **Higher Temperature (0.7-1.0)** = More creative, varied responses
- **For CyberSaathi**: Low temperature ensures:
  - Consistent, accurate cybersecurity advice
  - Reliable helpline information
  - Professional, action-focused responses
  - Less hallucination risk

---

## 🎯 Prompt Engineering - Deep Dive

### System Prompt Structure (Lines 36-80)

The system prompt is meticulously crafted with multiple sections:

#### 1. **Identity Definition**
```
You are CyberSaathi, Chandigarh Cyber Police's official helpline chatbot 
for cybercrime assistance.
```
- Establishes authority and purpose
- Sets professional context

#### 2. **Language Rules**
```
Default: English only
Hindi: Only when user explicitly asks for Hindi response
Stay consistent in chosen language
```
- Prevents language mixing
- Ensures clarity
- Handles bilingual users appropriately

#### 3. **Scope Limitation**
```
ONLY cybersecurity, cybercrime, digital safety topics
Off-topic response: "I'm CyberSaathi - I only help with cybercrime..."
```
- **Critical for safety**: Prevents the bot from answering unrelated queries
- Reduces liability
- Maintains focus on core mission

#### 4. **Response Format Template**
```
For Cybercrime Victims - Always Start With:
"🚨 URGENT: Call 1930 or file complaint at cybercrime.gov.in immediately"

Structure:
- Immediate Action (2-3 lines)
- Key Steps (5-6 bullet points max)
- Quick Tip (1-3 prevention line)
```
- **Structured Output**: Ensures consistent, actionable responses
- **Emergency First**: Critical information appears first
- **Mobile-Friendly**: Short, scannable format

#### 5. **Expertise Areas**
```
UPI/Online fraud, phishing, digital arrest scams
Sextortion, cyberbullying, identity theft
Social media hacking, OTP fraud, fake apps
Investment scams, job scams, ransomware
```
- Defines knowledge boundaries
- Helps model understand context
- Guides response relevance

#### 6. **Mobile-Friendly Rules**
```
Use short paragraphs (2-3 lines max)
bullet points for clarity
Bold important info
Include helpline: 1930 or 0172-2749900
Always mention: cybercrime.gov.in
```
- **UX Optimization**: Designed for mobile users
- **Accessibility**: Easy to read on small screens
- **Action Items**: Always includes contact information

#### 7. **Tone Guidelines**
```
Professional, helpful, action-focused, empathetic but concise.
```
- Balances empathy with urgency
- Maintains professional authority
- Keeps responses actionable

### Prompt Engineering Techniques Used

#### 1. **Role-Based Prompting**
- Defines the AI's role explicitly
- Creates consistent persona

#### 2. **Constraint-Based Prompting**
- Word limits (150 words)
- Format requirements
- Scope limitations

#### 3. **Template-Based Prompting**
- Structured response format
- Consistent sections
- Emergency protocol

#### 4. **Context-Aware Prompting**
- Scenario-based instructions
- Victim vs. general query handling
- Language preference handling

#### 5. **Safety Prompting**
- Off-topic rejection
- Emergency escalation
- Official helpline emphasis

### Advanced Prompt Features

#### Response Cleaning Function (Lines 82-98)
```javascript
function cleanResponse(content) {
  // Removes internal reasoning tags
  // Strips XML-like tags
  // Cleans whitespace
  // Fixes third-person references
}
```

**Why Needed?**
- Some models include internal reasoning in responses
- Ensures clean, user-facing output
- Maintains professional appearance

---

## 🔄 Complete Request-Response Cycle

### Full Example Flow

**1. User sends message:**
```javascript
POST /chat
{
  "messages": [
    { "role": "user", "content": "I got a call saying I won a lottery" }
  ]
}
```

**2. Backend processes:**
```javascript
// System prompt added
groqMessages = [
  { role: 'system', content: SYSTEM_PROMPT },
  { role: 'user', content: "I got a call saying I won a lottery" }
]

// API call
groqResponse = await axios.post('https://api.groq.com/...', {
  model: 'llama-3.3-70b-versatile',
  messages: groqMessages,
  temperature: 0.3,
  max_tokens: 1024
})
```

**3. Model generates response:**
- Recognizes as "lottery scam" / "investment scam"
- Applies victim response template
- Includes emergency helpline
- Provides prevention tips

**4. Response cleaned:**
- Removes any internal tags
- Formats properly

**5. User receives:**
```json
{
  "success": true,
  "response": "🚨 URGENT: Call 1930 or file complaint at cybercrime.gov.in immediately\n\nThis is a **lottery scam**... [formatted response]"
}
```

---

## 📊 Model Performance Characteristics

### Strengths:
1. **Fast Response Time**: Groq's inference speed is very fast
2. **Good Instruction Following**: Follows system prompt well
3. **Cost-Effective**: Lower API costs
4. **Consistent Output**: Low temperature ensures reliability

### Limitations:
1. **Context Window**: Limited by max_tokens (1024)
2. **No Real-Time Data**: Doesn't have access to current events beyond training
3. **Language**: Primarily English, Hindi support is conditional
4. **No Memory**: Each request is independent (no conversation memory in backend)

---

## 🛡️ Safety & Security Features

1. **API Key Protection**: Never exposed to frontend
2. **Input Validation**: Messages array validation
3. **Error Handling**: Graceful error responses
4. **Scope Limitation**: Off-topic queries rejected
5. **Emergency Escalation**: Always provides helpline numbers

---

## 📈 Additional Features

### News Aggregation System
- Automated web scraping from 6+ news sources
- Filters for cybersecurity-related content
- Updates every 12 hours
- Serves latest 6 articles via `/news` endpoint

### Booklet Serving
- Serves PDF educational materials
- Available via `/booklets` endpoint
- Static file serving

### Health Monitoring
- `/health` endpoint for system status
- `/news-status` for news crawl status
- Service availability checks

---

## 🎓 Key Takeaways

1. **Prompt Engineering is Critical**: The system prompt defines the entire chatbot behavior
2. **Model Selection Matters**: Llama 3.3 70B provides good balance of quality and cost
3. **Temperature Tuning**: Low temperature (0.3) ensures reliable, focused responses
4. **Response Formatting**: Structured prompts produce structured outputs
5. **Safety First**: Scope limitations and emergency protocols are essential
6. **Mobile Optimization**: Response format designed for mobile users

---

## 🔧 Technical Stack

- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **AI Provider**: Groq API
- **Model**: Llama 3.3 70B Versatile
- **Web Scraping**: Cheerio + Axios
- **Environment**: dotenv for configuration

---

This analysis provides a comprehensive understanding of how CyberSaathi's chatbot works, the model it uses, and the sophisticated prompt engineering that makes it effective for cybersecurity assistance.

