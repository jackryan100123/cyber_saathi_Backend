// @ts-nocheck
// TypeScript checking disabled - this is a JavaScript file with template strings
// that cause false positive linter errors

import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";
import { QUIZ_QUESTIONS } from "./quizQuestions.js";

// Load environment variables
dotenv.config();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HOST = process.env.HOST || "0.0.0.0"; // Bind to all interfaces

const app = express();
const PORT = process.env.PORT || 5000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Interval variables for news crawling (initialized as null)
let crawlInterval = null;
let cleanupInterval = null;

if (!GROQ_API_KEY) {
  throw new Error("GROQ_API_KEY is not set in environment variables");
}

// Configure CORS to allow Expo web origins and local development
app.use(cors({
  origin: [
    'http://localhost:8081',
    'http://localhost:19006',
    'http://192.168.2.52:8081', // Local IP for web development
    'https://cybersaathi.info', // Production domain
    /^https:\/\/.*\.exp\.direct$/, // Expo tunnel HTTPS origins
    /^https:\/\/.*\.exp\.d$/,     // Expo tunnel HTTPS origins
    /^https:\/\/.*\.exp\.dev$/,   // Expo tunnel HTTPS origins
    /^http:\/\/192\.168\.\d+\.\d+:\d+$/, // Any local IP address
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Booklets directory path
const BOOKLETS_DIR = path.join(__dirname, "booklets");

// GET /booklets - Get list of available booklets (MUST be before static middleware)
// Handle both /booklets and /booklets/ (with trailing slash)
app.get(["/booklets", "/booklets/"], (req, res) => {
  // Set CORS headers explicitly
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Content-Type', 'application/json');
  
  try {
    console.log("📚 Fetching booklets from:", BOOKLETS_DIR);
    
    // Check if booklets directory exists
    if (!fs.existsSync(BOOKLETS_DIR)) {
      console.log("⚠️ Booklets directory not found:", BOOKLETS_DIR);
      return res.json({
        success: true,
        booklets: [],
        message: "Booklets directory not found"
      });
    }

    // Read all files from booklets directory
    const files = fs.readdirSync(BOOKLETS_DIR);
    console.log("📁 Files found:", files);
    
    // Filter only PDF files
    const pdfFiles = files.filter(file => 
      file.toLowerCase().endsWith('.pdf')
    );
    
    console.log("📄 PDF files:", pdfFiles);

    // Get base URL from request
    const protocol = req.protocol || (req.secure ? 'https' : 'http');
    const host = req.get('host') || 'cybersaathi.info';
    const baseUrl = `${protocol}://${host}`;

    // Map files to booklet objects
    const booklets = pdfFiles.map((file, index) => {
      try {
        const filePath = path.join(BOOKLETS_DIR, file);
        const stats = fs.statSync(filePath);
        const fileSizeInBytes = stats.size;
        
        // Convert bytes to readable format
        let size = '';
        if (fileSizeInBytes < 1024) {
          size = `${fileSizeInBytes} B`;
        } else if (fileSizeInBytes < 1024 * 1024) {
          size = `${(fileSizeInBytes / 1024).toFixed(1)} KB`;
        } else {
          size = `${(fileSizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
        }

        // Create a readable title from filename
        const title = file
          .replace(/\.pdf$/i, '')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase());

        return {
          id: `booklet-${index + 1}`,
          title: title,
          filename: file,
          fileUrl: `${baseUrl}/booklets/${encodeURIComponent(file)}`,
          size: size
        };
      } catch (fileError) {
        console.error(`Error processing file ${file}:`, fileError.message);
        return null;
      }
    }).filter(booklet => booklet !== null);

    console.log("✅ Returning booklets:", booklets.length);
    
    res.json({
      success: true,
      booklets: booklets
    });
  } catch (error) {
    console.error("❌ Error fetching booklets:", error.message);
    console.error("Stack:", error.stack);
    res.status(500).json({
      success: false,
      error: "Failed to fetch booklets: " + error.message,
      booklets: []
    });
  }
});

// Serve static booklets (PDFs) - AFTER the list endpoint
// Only serve actual PDF files (e.g., /booklets/filename.pdf)
// Add middleware to skip directory requests (they're handled by GET route above)
app.use("/booklets", (req, res, next) => {
  // Skip if it's a request to /booklets or /booklets/ (no filename)
  // These are handled by the GET route above
  const pathAfterBooklets = req.path.replace(/^\/booklets\/?/, '');
  
  if (!pathAfterBooklets || pathAfterBooklets === '' || pathAfterBooklets === '/') {
    // This is a directory request, skip static middleware
    // It should have been handled by GET /booklets route above
    return res.status(404).json({
      success: false,
      error: "Not found. Use GET /booklets to get the list of booklets."
    });
  }
  
  // It's a file request, serve it using static middleware
  express.static(BOOKLETS_DIR, {
    index: false,
    dotfiles: 'ignore',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.pdf')) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');
      }
    }
  })(req, res, next);
});

// Detect explicit language requests from user
function detectExplicitLanguageRequest(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;

  // Get all user messages
  const allUserMessages = messages
    .filter((msg) => msg.role === "user")
    .map((msg) => msg.content?.toLowerCase() || "")
    .join(" ");

  // English request patterns - comprehensive coverage
  const englishRequests = [
    /\b(speak|reply|respond|answer|talk|write|type|tell|explain|say)\s+(in\s+)?english\b/i,
    /\b(english\s+me|english\s+mein|english\s+language|english\s+only)\b/i,
    /\b(use\s+english|in\s+english|english\s+me\s+(batao|bataiye|bolo|likho|samjhao))\b/i,
    /\b(english\s+(me|mein)\s+(batao|bataiye|bolo|likho|samjhao))\b/i,
  ];

  // Hindi request patterns - comprehensive coverage including "hindi me bataiye"
  const hindiRequests = [
    // Standard patterns
    /\b(speak|reply|respond|answer|talk|write|type|tell|explain|say)\s+(in\s+)?hindi\b/i,
    /\b(hindi\s+me|hindi\s+mein|hindi\s+language)\b/i,
    /\b(use\s+hindi|in\s+hindi|hindi\s+only)\b/i,
    // Hindi me + verb patterns (most important for "hindi me bataiye")
    /\bhindi\s+me\s+(batao|bataiye|bata|bolo|boliye|likho|likhiye|samjhao|samjhaiye|kaho|kahiye|bataye|batayen)\b/i,
    /\bhindi\s+mein\s+(batao|bataiye|bata|bolo|boliye|likho|likhiye|samjhao|samjhaiye|kaho|kahiye|bataye|batayen)\b/i,
    // Verb + hindi me patterns
    /\b(batao|bataiye|bata|bolo|boliye|likho|likhiye|samjhao|samjhaiye|kaho|kahiye|bataye|batayen)\s+(hindi\s+me|hindi\s+mein)\b/i,
    // Hindi in Devanagari script
    /\b(\u0939\u093f\u0928\u094d\u0926\u0940\s+|\u0939\u093f\u0928\u094d\u0926\u0940\s+\u092e\u0947\u0902|\u0939\u093f\u0928\u094d\u0926\u0940\s+\u092e\u0947)\b/i,
    // More flexible patterns
    /\b(hindi\s+me|hindi\s+mein)\s+(bata|bataye|batayen|bol|likh|samjha|kaha)\b/i,
  ];

  // Hinglish request patterns
  const hinglishRequests = [
    /\b(speak|reply|respond|answer|talk|write|type|tell|explain|say)\s+(in\s+)?hinglish\b/i,
    /\b(hinglish\s+me|hinglish\s+mein|hinglish\s+language|hinglish\s+only)\b/i,
    /\b(use\s+hinglish|in\s+hinglish|roman\s+hindi)\b/i,
    // Hinglish me + verb patterns
    /\bhinglish\s+me\s+(batao|bataiye|bata|bolo|boliye|likho|likhiye|samjhao|samjhaiye|kaho|kahiye)\b/i,
    /\bhinglish\s+mein\s+(batao|bataiye|bata|bolo|boliye|likho|likhiye|samjhao|samjhaiye|kaho|kahiye)\b/i,
  ];

  // Check for explicit requests (most recent messages have priority)
  // Check the MOST RECENT message first (highest priority)
  const userMessages = messages.filter((msg) => msg.role === "user");
  if (userMessages.length > 0) {
    // Check last 3 messages, most recent first
    const recentMessages = userMessages
      .slice(-3)
      .map((msg) => msg.content?.toLowerCase() || "")
      .reverse(); // Most recent first

    for (const msg of recentMessages) {
      // Check English first
      if (englishRequests.some((pattern) => pattern.test(msg))) {
        return "en";
      }
      // Check Hindi
      if (hindiRequests.some((pattern) => pattern.test(msg))) {
        return "hi";
      }
      // Check Hinglish
      if (hinglishRequests.some((pattern) => pattern.test(msg))) {
        return "hinglish";
      }
    }
  }

  return null; // No explicit request found
}

// Language detection function - analyzes entire conversation
function detectLanguage(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return "en";

  // First, check for explicit language requests (highest priority)
  // This MUST be checked first and take precedence over everything else
  const explicitLanguage = detectExplicitLanguageRequest(messages);
  if (explicitLanguage) {
    console.log(
      `[Language Detection] Explicit language request detected: ${explicitLanguage}`
    );
    return explicitLanguage;
  }

  // Get the most recent user message for priority checking
  const userMessages = messages.filter((msg) => msg.role === "user");
  const lastUserMessage =
    userMessages.length > 0
      ? userMessages[userMessages.length - 1]?.content || ""
      : "";

  // Get all user messages from conversation
  const allUserMessages = messages
    .filter((msg) => msg.role === "user")
    .map((msg) => msg.content || "")
    .join(" ");

  if (!allUserMessages.trim()) return "en";

  // Check most recent message first for language indicators
  if (lastUserMessage) {
    // Check for Devanagari script in recent message (strong indicator)
    const devanagariRegex = /[\u0900-\u097F]/;
    if (devanagariRegex.test(lastUserMessage)) {
      return "hi"; // Hindi in Devanagari
    }

    // Check for Hinglish patterns in recent message
    // Using more specific Hindi words that are less likely to appear in pure English
    const recentHinglishPatterns = [
      /\b(main|tum|aap|kyun|kaise|kya|hai|hoga|hogi|honge|hain|hoon|ho|hun)\b/gi,
      /\b(mujhe|tujhe|usko|unko|isko|inko|yahan|wahan|idhar|udhar|kahan|kabhi)\b/gi,
      /\b(acha|theek|bilkul|zaroor|sahi|galat|nahi|haan|kab|kaun|kisne|kisko|kisse)\b/gi,
      /\b(mera|mere|meri|tera|tumhara|apka|unka|iska|jiska|jiski|jisse)\b/gi,
      /\b(yeh|woh|yahi|wahi|yahan|wahan|idhar|udhar|kabhi|kab)\b/gi,
    ];

    const recentHinglishMatches = recentHinglishPatterns.reduce(
      (count, pattern) => count + (lastUserMessage.match(pattern) || []).length,
      0
    );

    // Check if text is primarily English first
    // Count common English words to determine if it's mostly English
    const commonEnglishWords = /\b(the|and|or|but|in|on|at|to|for|of|with|from|by|as|is|are|was|were|be|been|have|has|had|do|does|did|will|would|should|could|may|might|can|must|this|that|these|those|what|when|where|why|how|who|which|you|your|they|their|them|we|our|us|it|its)\b/gi;
    const englishWordMatches = (lastUserMessage.match(commonEnglishWords) || []).length;
    const totalWordsInMessage = lastUserMessage.split(/\s+/).filter(w => w.length > 0).length;
    const englishRatio = totalWordsInMessage > 0 ? englishWordMatches / totalWordsInMessage : 0;

    // Only detect Hinglish if:
    // 1. There are 3+ Hindi word matches (increased threshold)
    // 2. AND the text is NOT primarily English (less than 60% English words)
    // This prevents false positives on pure English text
    if (recentHinglishMatches >= 3 && englishRatio < 0.6) {
      return "hinglish";
    }
  }

  // Check for Devanagari script in entire conversation (Hindi, Marathi, etc.)
  const devanagariRegex = /[\u0900-\u097F]/;
  if (devanagariRegex.test(allUserMessages)) {
    return "hi"; // Hindi in Devanagari
  }

  // Check for Hinglish/Roman Hindi patterns in entire conversation
  // Using more specific Hindi words that are less likely to appear in pure English
  const hinglishPatterns = [
    /\b(main|tum|aap|kyun|kaise|kya|hai|hoga|hogi|honge|hain|hoon|ho|hun)\b/gi,
    /\b(mujhe|tujhe|usko|unko|isko|inko|yahan|wahan|idhar|udhar|kahan|kabhi)\b/gi,
    /\b(acha|theek|bilkul|zaroor|sahi|galat|nahi|haan|kab|kaun|kisne|kisko|kisse)\b/gi,
    /\b(mera|mere|meri|tera|tumhara|apka|unka|iska|jiska|jiski|jisse)\b/gi,
    /\b(yeh|woh|yahi|wahi|yahan|wahan|idhar|udhar|kabhi|kab)\b/gi,
  ];

  const hinglishMatches = hinglishPatterns.reduce(
    (count, pattern) => count + (allUserMessages.match(pattern) || []).length,
    0
  );

  // Calculate ratio of Hinglish words to total words
  const totalWords = allUserMessages.split(/\s+/).filter(w => w.length > 0).length;
  const hinglishRatio = hinglishMatches / Math.max(totalWords, 1);

  // Check if text is primarily English
  const commonEnglishWords = /\b(the|and|or|but|in|on|at|to|for|of|with|from|by|as|is|are|was|were|be|been|have|has|had|do|does|did|will|would|should|could|may|might|can|must|this|that|these|those|what|when|where|why|how|who|which|you|your|they|their|them|we|our|us|it|its)\b/gi;
  const englishWordMatches = (allUserMessages.match(commonEnglishWords) || []).length;
  const englishRatio = totalWords > 0 ? englishWordMatches / totalWords : 0;

  // Only detect Hinglish if:
  // 1. There are 4+ Hindi word matches (increased threshold for entire conversation)
  // 2. AND the Hinglish ratio is significant (>15% instead of 10%)
  // 3. AND the text is NOT primarily English (less than 70% English words)
  // This prevents false positives on pure English text
  if ((hinglishMatches >= 4 || hinglishRatio > 0.15) && englishRatio < 0.7) {
    return "hinglish";
  }

  // Default to English
  return "en";
}

// Victim detection function - checks entire conversation
function detectVictimStatus(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return false;

  // Get all user messages from conversation
  const allUserMessages = messages
    .filter((msg) => msg.role === "user")
    .map((msg) => msg.content?.toLowerCase() || "")
    .join(" ");

  // Victim indicators (English and Hindi/Hinglish)
  const victimKeywords = [
    // English
    "victim",
    "scammed",
    "fraud",
    "hacked",
    "stolen",
    "lost money",
    "money gone",
    "account hacked",
    "upi fraud",
    "phishing",
    "sextortion",
    "blackmail",
    "threatened",
    "extorted",
    "duped",
    "cheated",
    "robbed",
    "happened to me",
    "i was",
    "someone took",
    "unauthorized",
    "without permission",
    "stole from",
    // Hindi/Hinglish
    "mujhe",
    "mere saath",
    "mere paise",
    "mera account",
    "mera paisa",
    "scam ho gaya",
    "fraud ho gaya",
    "paisa gaya",
    "chori ho gaya",
    "hack ho gaya",
    "account hack",
    "paisa chala gaya",
    "mujhe scam",
    "mujhe fraud",
    "mere paise chale gaye",
  ];

  // Check if any message contains victim indicators
  const hasVictimKeywords = victimKeywords.some((keyword) =>
    allUserMessages.includes(keyword)
  );

  // Check for past tense verbs indicating something happened
  const pastTensePatterns = [
    /\b(was|were|got|received|happened|occurred|took place)\b.*\b(fraud|scam|hack|theft|attack)\b/i,
    /\b(money|amount|rupees|rs)\b.*\b(transferred|deducted|gone|lost|stolen|taken)\b/i,
    /\b(someone|anyone|they|he|she)\b.*\b(took|stole|hacked|scammed|fraud)\b/i,
    /\b(without|without my)\b.*\b(permission|consent|knowledge)\b/i,
  ];

  const hasPastTenseIncident = pastTensePatterns.some((pattern) =>
    pattern.test(allUserMessages)
  );

  // Check for explicit victim statements
  const explicitVictimPatterns = [
    /\b(i am|i'm|main hoon|mujhe hua)\b.*\b(victim|scam|fraud)\b/i,
    /\b(something|kuch)\b.*\b(happened|hua)\b.*\b(to me|mujhe)\b/i,
  ];

  const hasExplicitVictimStatement = explicitVictimPatterns.some((pattern) =>
    pattern.test(allUserMessages)
  );

  return (
    hasVictimKeywords || hasPastTenseIncident || hasExplicitVictimStatement
  );
}

// Detect if query is asking for contact information
function detectReportingQuery(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  
  const lastUserMessage = messages
    .filter((msg) => msg.role === "user")
    .pop()?.content?.toLowerCase() || "";
  
  if (!lastUserMessage) return false;
  
  // Reporting query patterns - catch ALL variations including specific crime types
  const reportingPatterns = [
    /how to report/,
    /how.*report.*crime/,
    /how.*report.*cyber/,
    /how.*report.*digital/,
    /how.*report.*arrest/,
    /how.*report.*fraud/,
    /how.*report.*phishing/,
    /how.*report.*scam/,
    /report.*crime/,
    /report.*cyber/,
    /report.*digital/,
    /report.*arrest/,
    /report.*fraud/,
    /file.*complaint/,
    /reporting.*cyber/,
    /reporting.*crime/,
    /report a/,
    /report.*digital arrest/,
    /report.*upi fraud/,
    /report.*sextortion/,
  ];
  
  return reportingPatterns.some(pattern => pattern.test(lastUserMessage));
}

function detectContactQuery(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  
  const lastUserMessage = messages
    .filter((msg) => msg.role === "user")
    .pop()?.content?.toLowerCase() || "";
  
  if (!lastUserMessage) return false;
  
  // Contact query patterns
  const contactPatterns = [
    // Rank + department patterns
    /\b(dsp|sp|ssp|dgp|igp|sdpo)\s+(cyber|crime|traffic|security)/i,
    /\b(cyber|crime|traffic|security)\s+(dsp|sp|ssp|dgp|igp|sdpo)/i,
    // "tell me about" + rank + department
    /tell\s+me\s+about\s+(dsp|sp|ssp|dgp|igp|sdpo)\s+(cyber|crime|traffic|security)/i,
    /tell\s+me\s+about\s+(cyber|crime|traffic|security)\s+(dsp|sp|ssp|dgp|igp|sdpo)/i,
    // Contact keywords
    /\b(contact|phone|number|reach|call)\s+(dsp|sp|ssp|dgp|igp|sdpo|officer)/i,
    /\b(dsp|sp|ssp|dgp|igp|sdpo|officer)\s+(contact|phone|number)/i,
    // Officer directory queries
    /\b(officer|police)\s+(contact|directory|phone|number)/i,
    /\b(contact|directory|phone)\s+(officer|police)/i,
  ];
  
  return contactPatterns.some(pattern => pattern.test(lastUserMessage));
}

// Load and parse contact information from contact.json
function loadContactDirectory() {
  try {
    const contactFilePath = path.join(__dirname, "contact.json");
    if (!fs.existsSync(contactFilePath)) {
      console.warn("Contact directory file not found:", contactFilePath);
      return "";
    }

    const contactContent = fs.readFileSync(contactFilePath, "utf-8");
    const contactData = JSON.parse(contactContent);
    
    // Format the contact data into a searchable text format for the AI
    const directory = contactData.chandigarh_police_directory_2025_10_27;
    let formattedContacts = "CHANDIGARH POLICE OFFICER DIRECTORY (Updated: 27.10.2025)\n\n";
    
    // Format each category - keys must match exactly with JSON structure
    const categories = [
      { key: "DGP/IGP/SSP", title: "DGP/IGP/SSP Level Officers" },
      { key: "SP_Level", title: "SP Level Officers" },
      { key: "SDPO_DSP_SubDivisions", title: "SDPO/DSP - Subdivisions" },
      { key: "DSP_Branch_Units", title: "DSP - Branch Units" },
      { key: "Traffic_Wing", title: "Traffic Wing" },
      { key: "Crime_Units", title: "Crime Units" },
      { key: "PCR_Welfare_Community", title: "PCR/Welfare/Community" },
      { key: "Training_IT_Support", title: "Training/IT Support" },
      { key: "Security", title: "Security" },
      { key: "Admin_Office_Staff", title: "Admin/Office Staff" }
    ];
    
    // Also add a comprehensive search index for intelligent matching
    let searchIndex = "\n\nSEARCH INDEX (for intelligent matching):\n";
    searchIndex += "- Search by name (full or partial): e.g., 'Geetanjali', 'Hooda', 'Venkatesh', 'DGP'\n";
    searchIndex += "- Search by rank: DGP, IGP, SSP, SP, DSP, SDPO\n";
    searchIndex += "- Search by department: Cyber Crime, Traffic, Crime, Security, Operations, etc.\n";
    searchIndex += "- Search by rank + department: 'DSP cyber crime', 'SP cyber crime', 'cyber crime DSP'\n";
    searchIndex += "- Search by designation keywords: 'Cyber Crime', 'Traffic', 'Crime', 'Security'\n";
    searchIndex += "\nIMPORTANT: Queries like 'tell me about DSP cyber crime' or 'DSP cyber crime' should return:\n";
    searchIndex += "Sh. A. Venkatesh, DANIPS - DSP/Cyber Crime Cell (Mobile: 7087239002 / 9779580994, Office: 2740012 / 2760820 / 2920097)\n";
    
    categories.forEach(category => {
      if (directory[category.key] && directory[category.key].length > 0) {
        formattedContacts += `\n${category.title}:\n`;
        directory[category.key].forEach(officer => {
          formattedContacts += `\n${officer.name || "N/A"}`;
          if (officer.rank) formattedContacts += ` (${officer.rank})`;
          if (officer.designation) formattedContacts += ` - ${officer.designation}`;
          if (officer.charges && officer.charges.length > 0) {
            formattedContacts += ` [Charges: ${officer.charges.join(", ")}]`;
          }
          // Highlight Cyber Crime officers for better visibility
          if (officer.designation && officer.designation.toLowerCase().includes("cyber crime")) {
            formattedContacts += " [CYBER CRIME OFFICER]";
          }
          formattedContacts += "\n";
          
          if (officer.contact) {
            if (officer.contact.mobile) {
              const mobiles = Array.isArray(officer.contact.mobile) 
                ? officer.contact.mobile.join(", ") 
                : officer.contact.mobile;
              formattedContacts += `  Mobile: ${mobiles}\n`;
            }
            if (officer.contact.landline_office && officer.contact.landline_office.length > 0) {
              formattedContacts += `  Office: ${officer.contact.landline_office.join(" / ")}\n`;
            }
            if (officer.contact.residence) {
              const residences = Array.isArray(officer.contact.residence)
                ? officer.contact.residence.join(" / ")
                : officer.contact.residence;
              formattedContacts += `  Residence: ${residences}\n`;
            }
            if (officer.contact.fax) {
              formattedContacts += `  Fax: ${officer.contact.fax}\n`;
            }
          }
        });
      }
    });
    
    return formattedContacts + searchIndex;
  } catch (error) {
    console.error("❌ Error loading contact directory:", error.message);
    return "";
  }
}

// ==================== HEALTH CHECK ENDPOINT ====================

// GET /health - Health check endpoint for frontend connection status
app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "online",
    message: "CyberSaathi backend is running",
    timestamp: new Date().toISOString()
  });
});

// ==================== QUIZ ENDPOINTS ====================

// Quiz questions are imported from quizQuestions.js file

// GET /quiz/questions - Returns 10 random questions with correct answers
app.get("/quiz/questions", (req, res) => {
  try {
    // Shuffle array and pick 10 random questions
    const shuffled = [...QUIZ_QUESTIONS].sort(() => Math.random() - 0.5);
    const selectedQuestions = shuffled.slice(0, 10).map(q => ({
      id: q.id,
      question: q.question,
      options: q.options,
      correctAnswer: q.correctAnswer // Include correct answer for immediate verification
    }));

    res.json({
      success: true,
      questions: selectedQuestions,
      totalQuestions: QUIZ_QUESTIONS.length
    });
  } catch (error) {
    console.error("❌ Error fetching quiz questions:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch quiz questions"
    });
  }
});

// POST /quiz/submit - Submit quiz answers and get results
app.post("/quiz/submit", (req, res) => {
  try {
    const { answers } = req.body; // Array of { questionId, selectedAnswer }

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid answers format"
      });
    }

    let correctCount = 0;
    const results = answers.map(answer => {
      const question = QUIZ_QUESTIONS.find(q => q.id === answer.questionId);
      if (!question) {
        return {
          questionId: answer.questionId,
          correct: false,
          correctAnswer: null,
          userAnswer: answer.selectedAnswer
        };
      }

      const isCorrect = question.correctAnswer === answer.selectedAnswer;
      if (isCorrect) correctCount++;

      return {
        questionId: answer.questionId,
        question: question.question,
        correct: isCorrect,
        correctAnswer: question.correctAnswer,
        correctAnswerText: question.options[question.correctAnswer],
        userAnswer: answer.selectedAnswer,
        userAnswerText: question.options[answer.selectedAnswer]
      };
    });

    const totalQuestions = answers.length;
    const score = Math.round((correctCount / totalQuestions) * 100);

    res.json({
      success: true,
      score,
      correctCount,
      totalQuestions,
      results
    });
  } catch (error) {
    console.error("❌ Error submitting quiz:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to process quiz submission"
    });
  }
});

// ==================== CHAT ENDPOINT ====================

// System prompt for the chatbot
const SYSTEM_PROMPT = `You are CyberSaathi, an AI-powered cybersecurity assistant for Chandigarh Cyber Police. Your role is to help users stay safe online and provide guidance on cybersecurity matters.

Key Responsibilities:
1. Provide cybersecurity tips and best practices
2. Help users understand cyber threats (phishing, malware, scams, etc.)
3. Guide users on how to report cybercrimes
4. Answer questions about online safety
5. Provide emergency helpline information when needed

Important Guidelines:
- Always be helpful, friendly, and professional
- Use simple, clear language
- For emergency situations, always mention: Call 1930 or visit cybercrime.gov.in
- If asked about reporting cybercrime, provide step-by-step guidance
- Never ask for personal information like passwords, PINs, or OTPs
- If you don't know something, admit it and suggest contacting official channels

Emergency Helpline: 1930
Cyber Crime Portal: cybercrime.gov.in`;

// POST /chat - Handle chat messages
app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Messages array is required"
      });
    }

    if (!GROQ_API_KEY) {
      return res.status(503).json({
        success: false,
        error: "Service temporarily unavailable. Please try again later."
      });
    }

    // Detect language and victim status
    const detectedLanguage = detectLanguage(messages);
    const isVictim = detectVictimStatus(messages);
    const isReportingQuery = detectReportingQuery(messages);
    const isContactQuery = detectContactQuery(messages);

    // Load contact directory if needed
    let contactDirectory = "";
    if (isContactQuery || isReportingQuery) {
      contactDirectory = loadContactDirectory();
    }

    // Build system prompt with context
    let enhancedSystemPrompt = SYSTEM_PROMPT;
    
    if (isVictim) {
      enhancedSystemPrompt += "\n\n⚠️ IMPORTANT: The user appears to be a victim of cybercrime. Provide immediate guidance on reporting and emergency contacts.";
    }
    
    if (detectedLanguage === "hi" || detectedLanguage === "hinglish") {
      enhancedSystemPrompt += "\n\nLanguage Preference: Respond in Hindi or Hinglish as appropriate.";
    }

    if (contactDirectory) {
      enhancedSystemPrompt += `\n\nCHANDIGARH POLICE OFFICER DIRECTORY:\n${contactDirectory}\n\nUse this directory to answer queries about police contacts, officers, or reporting procedures.`;
    }

    // Prepare messages for Groq API
    const groqMessages = [
      { role: "system", content: enhancedSystemPrompt },
      ...messages
    ];

    // Call Groq API
    const groqResponse = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: groqMessages,
        max_tokens: 1024,
        temperature: 0.3,
        top_p: 0.9,
        stream: false
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    let responseText = groqResponse.data.choices[0]?.message?.content || "";

    // Clean response (remove any internal tags)
    responseText = responseText.replace(/<think>[\s\S]*?<\/redacted_reasoning>/gi, "");
    responseText = responseText.replace(/<[^>]+>/g, "").trim();

    res.json({
      success: true,
      response: responseText
    });
  } catch (error) {
    console.error("❌ Error in chat endpoint:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to process chat message. Please try again."
    });
  }
});

// ==================== NEWS CRAWLING SECTION ====================

// Enhanced news sources with better selectors
const NEWS_SOURCES = [
  {
    name: "The Hindu",
    url: "https://www.thehindu.com/news/national/",
    selectors: {
      articles: "article.story-card, div.story-card, div.element",
      title: "h2 a, h3 a, .title a, a.story-card-title",
      link: "h2 a, h3 a, .title a, a.story-card-title",
      description: ".intro, .standfirst, p"
    }
  },
  {
    name: "Times of India",
    url: "https://timesofindia.indiatimes.com/india",
    selectors: {
      articles: "div.w_tle, div.list5, article, div.uwB35",
      title: "a[href*='/articleshow/'], span.w_tle a",
      link: "a[href*='/articleshow/'], span.w_tle a",
      description: ".w_desc, p"
    }
  },
  {
    name: "NDTV",
    url: "https://www.ndtv.com/india",
    selectors: {
      articles: "div.news_Itm, article, div.lisingNews",
      title: "h2 a, .newsHdng a, a.newsHdng",
      link: "h2 a, .newsHdng a, a.newsHdng",
      description: ".news_Itm-cont, p"
    }
  },
  {
    name: "India Today",
    url: "https://www.indiatoday.in/india",
    selectors: {
      articles: "div.story-card, article, div.view__item",
      title: "h2 a, h3 a, .headline a",
      link: "h2 a, h3 a, .headline a",
      description: ".description, p"
    }
  }
];

// Enhanced cybersecurity keywords
const CYBERSECURITY_KEYWORDS = [
  // Core terms
  "cyber", "hack", "hacking", "hacked", "hacker",
  "phishing", "malware", "ransomware", "fraud", "scam",
  "data breach", "breach", "privacy", "security",
  
  // Specific crimes
  "digital arrest", "upi fraud", "online fraud", "cybercrime",
  "identity theft", "social engineering", "sextortion",
  "blackmail", "cryptocurrency scam", "crypto scam",
  
  // Technology-related
  "password leak", "account hack", "email hack",
  "whatsapp fraud", "telegram scam", "facebook hack",
  "instagram hack", "twitter hack", "social media hack",
  
  // Financial
  "bank fraud", "credit card fraud", "debit card fraud",
  "payment fraud", "digital payment", "net banking fraud",
  
  // Indian context
  "aadhaar leak", "pan card fraud", "kyc fraud",
  "otp fraud", "sim swap", "vishing", "smishing",
  
  // General tech crime
  "online harassment", "cyberbullying", "deepfake",
  "fake news", "misinformation", "data theft"
];

// Function to check if article is cybersecurity-related
function isCybersecurityRelated(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  return CYBERSECURITY_KEYWORDS.some(keyword => 
    text.includes(keyword.toLowerCase())
  );
}

// Function to normalize URL
function normalizeUrl(link, sourceUrl) {
  if (!link) return null;
  
  try {
    // If it's already a full URL
    if (link.startsWith('http://') || link.startsWith('https://')) {
      return link;
    }
    
    // If it's a protocol-relative URL
    if (link.startsWith('//')) {
      return 'https:' + link;
    }
    
    // If it's a relative URL
    const baseUrl = new URL(sourceUrl);
    if (link.startsWith('/')) {
      return baseUrl.origin + link;
    } else {
      return baseUrl.origin + '/' + link;
    }
  } catch (err) {
    console.error('Error normalizing URL:', err.message);
    return null;
  }
}

// Function to crawl news from a single source with retry logic
async function crawlNewsSource(source, retries = 2) {
  const articles = [];
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`🔄 Retry ${attempt} for ${source.name}...`);
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
      }
      
      console.log(`📰 Crawling ${source.name}... (Attempt ${attempt + 1})`);
      
      const response = await axios.get(source.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 15000,
        maxRedirects: 5
      });

      const $ = cheerio.load(response.data);
      let articleCount = 0;
      
      // Try to find articles
      const articleElements = $(source.selectors.articles);
      console.log(`Found ${articleElements.length} potential articles from ${source.name}`);
      
      articleElements.slice(0, 20).each((i, element) => {
        try {
          const $el = $(element);
          
          // Extract title
          const $titleEl = $el.find(source.selectors.title).first();
          const title = $titleEl.text().trim() || $titleEl.attr('title')?.trim();
          
          // Extract link
          let link = $titleEl.attr('href');
          if (!link) {
            link = $el.find(source.selectors.link).first().attr('href');
          }
          
          // Extract description
          let description = $el.find(source.selectors.description).first().text().trim();
          if (!description || description.length < 20) {
            description = "Cybersecurity and crime related news from India";
          }

          // Validate and normalize
          if (!title || title.length < 10) return;
          
          link = normalizeUrl(link, source.url);
          if (!link) return;

          // Filter for cybersecurity-related articles
          if (isCybersecurityRelated(title, description)) {
            articles.push({
              title: title.substring(0, 200),
              description: description.substring(0, 300),
              url: link,
              publishedAt: new Date().toISOString(),
              source: source.name,
              category: "Cybersecurity",
              crawledAt: new Date().toISOString()
            });
            articleCount++;
          }
        } catch (err) {
          // Skip invalid articles silently
        }
      });

      console.log(`✅ Found ${articleCount} cybersecurity articles from ${source.name}`);
      
      // If we found articles, break the retry loop
      if (articles.length > 0) {
        break;
      }
      
    } catch (error) {
      console.error(`❌ Error crawling ${source.name} (Attempt ${attempt + 1}):`, error.message);
      
      // If this was the last retry, log it
      if (attempt === retries) {
        console.error(`❌ Failed to crawl ${source.name} after ${retries + 1} attempts`);
      }
    }
  }

  return articles;
}

// Function to get fallback articles if crawling fails
function getFallbackArticles() {
  return [
    {
      title: "Stay Alert: Common Cybersecurity Threats in India",
      description: "Learn about the most common cyber threats...",
      url: "https://cybercrime.gov.in",
      publishedAt: new Date().toISOString(),
      source: "CyberSaathi",
      category: "Cybersecurity",
      crawledAt: new Date().toISOString()
    },
    {
      title: "Report Cybercrime: Your Complete Guide",
      description: "Step-by-step guide on how to report cybercrimes...",
      url: "https://cybercrime.gov.in/Report.aspx",
      publishedAt: new Date().toISOString(),
      source: "CyberSaathi",
      category: "Cybersecurity",
      crawledAt: new Date().toISOString()
    },
    {
      title: "Digital Arrest Scams: What You Need to Know",
      description: "Digital arrest scams are on the rise...",
      url: "https://cybercrime.gov.in",
      publishedAt: new Date().toISOString(),
      source: "CyberSaathi",
      category: "Cybersecurity",
      crawledAt: new Date().toISOString()
    },
    {
      title: "Protect Your UPI Transactions",
      description: "UPI fraud is becoming increasingly common...",
      url: "https://cybercrime.gov.in",
      publishedAt: new Date().toISOString(),
      source: "CyberSaathi",
      category: "Cybersecurity",
      crawledAt: new Date().toISOString()
    },
    {
      title: "Understanding Phishing Attacks",
      description: "Phishing attacks are one of the most common cyber threats...",
      url: "https://cybercrime.gov.in",
      publishedAt: new Date().toISOString(),
      source: "CyberSaathi",
      category: "Cybersecurity",
      crawledAt: new Date().toISOString()
    },
    // NEW 6TH ARTICLE ADDED:
    {
      title: "Secure Your Social Media Accounts",
      description: "Social media account hacking is a growing concern. Learn how to protect your Facebook, Instagram, and other social media accounts from unauthorized access.",
      url: "https://cybercrime.gov.in",
      publishedAt: new Date().toISOString(),
      source: "CyberSaathi",
      category: "Cybersecurity",
      crawledAt: new Date().toISOString()
    }
  ];
}
// Main function to crawl all news sources
async function crawlNews() {
  console.log("\n🕷️ Starting news crawl...");
  const startTime = Date.now();
  
  try {
    // Crawl all sources in parallel with 30 second timeout per source
    const crawlPromises = NEWS_SOURCES.map(source => 
      Promise.race([
        crawlNewsSource(source),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 30000)
        )
      ]).catch(err => {
        console.error(`Skipping ${source.name}:`, err.message);
        return [];
      })
    );
    
    const results = await Promise.all(crawlPromises);
    
    // Flatten and deduplicate articles
    let allArticles = results.flat();
    
    // If no articles found, use fallback
    if (allArticles.length === 0) {
      console.warn("⚠️ No articles found from sources, using fallback articles");
      allArticles = getFallbackArticles();
    }
    
    // Remove duplicates based on URL
    const seenUrls = new Set();
    allArticles = allArticles.filter(article => {
      if (seenUrls.has(article.url)) {
        return false;
      }
      seenUrls.add(article.url);
      return true;
    });

    // Sort by crawledAt (newest first) and limit to 20
    allArticles.sort((a, b) => 
      new Date(b.crawledAt) - new Date(a.crawledAt)
    );
    allArticles = allArticles.slice(0, 6);

    // Load existing articles
    const newsFilePath = path.join(__dirname, "news_data.json");
    let existingArticles = [];
    
    if (fs.existsSync(newsFilePath)) {
      try {
        const existingData = JSON.parse(
          fs.readFileSync(newsFilePath, "utf-8")
        );
        existingArticles = existingData.articles || [];
      } catch (err) {
        console.error("Error reading existing news data:", err.message);
      }
    }

    // Merge new articles with existing ones (keep unique by URL)
    const existingUrls = new Set(existingArticles.map(a => a.url));
    const newArticles = allArticles.filter(a => !existingUrls.has(a.url));
    
    // Combine: new articles first, then existing (up to 30 total for better cache)
    const mergedArticles = [...newArticles, ...existingArticles]
      .slice(0, 6)
      .sort((a, b) => 
        new Date(b.crawledAt || b.publishedAt) - 
        new Date(a.crawledAt || a.publishedAt)
      );

    // Ensure we always have at least 3 articles (add fallback if needed)
    if (mergedArticles.length < 6) {
      const fallbackArticles = getFallbackArticles();
      const fallbackUrls = new Set(mergedArticles.map(a => a.url));
      const neededFallback = fallbackArticles.filter(
        a => !fallbackUrls.has(a.url)
      ).slice(0, 6 - mergedArticles.length);
      mergedArticles.push(...neededFallback);
    }

    // Save to file
    const newsData = {
      lastUpdated: new Date().toISOString(),
      totalArticles: mergedArticles.length,
      newArticlesCount: newArticles.length,
      articles: mergedArticles
    };

    fs.writeFileSync(
      newsFilePath, 
      JSON.stringify(newsData, null, 2), 
      "utf-8"
    );
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ News crawl completed in ${duration}s`);
    console.log(`📊 Total articles: ${mergedArticles.length} (${newArticles.length} new)`);
    
    return mergedArticles;
  } catch (error) {
    console.error("❌ Error during news crawl:", error.message);
    
    // Return fallback articles on complete failure
    const fallbackArticles = getFallbackArticles();
    const newsFilePath = path.join(__dirname, "news_data.json");
    
    const newsData = {
      lastUpdated: new Date().toISOString(),
      totalArticles: fallbackArticles.length,
      newArticlesCount: 0,
      articles: fallbackArticles,
      note: "Using fallback articles due to crawl failure"
    };
    
    fs.writeFileSync(
      newsFilePath, 
      JSON.stringify(newsData, null, 2), 
      "utf-8"
    );
    
    return fallbackArticles;
  }
}


// ==================== NEWS ENDPOINT ====================

// GET /news - Get cybersecurity news articles
app.get("/news", (req, res) => {
  try {
    const newsFilePath = path.join(__dirname, "news_data.json");
    
    if (!fs.existsSync(newsFilePath)) {
      return res.json({
        success: true,
        articles: getFallbackArticles(),
        message: "News data file not found, using fallback articles"
      });
    }

    const newsContent = fs.readFileSync(newsFilePath, "utf-8");
    const newsData = JSON.parse(newsContent);

    // Return latest articles (limit to 20)
    const articles = (newsData.articles || []).slice(0, 6).map(article => ({
      title: article.title,
      description: article.description,
      url: article.url,
      publishedAt: article.publishedAt,
      source: article.source,
      category: article.category || "Cybersecurity"
    }));

    res.json({
      success: true,
      articles: articles,
      lastUpdated: newsData.lastUpdated
    });
  } catch (error) {
    console.error("❌ Error fetching news:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch news articles",
      articles: getFallbackArticles()
    });
  }
});

// ==================== MANUAL CRAWL ENDPOINT ====================

// POST /admin/crawl-news - Manual trigger for news crawling (for testing)
app.post("/admin/crawl-news", async (req, res) => {
  try {
    console.log("🔧 Manual news crawl triggered...");
    const articles = await crawlNews();
    res.json({
      success: true,
      message: "News crawl completed",
      articlesFound: articles.length,
      articles: articles.slice(0, 5) // Show first 5 as preview
    });
  } catch (error) {
    console.error("Error in manual crawl:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== SERVER INITIALIZATION ====================

// Start crawling immediately on server start, then every 12 hours
console.log("🕷️ Initializing news crawler...");
crawlNews().then(() => {
  console.log("✅ Initial news crawl completed");
}).catch(err => {
  console.error("❌ Initial crawl failed:", err.message);
});

// Set up interval for auto-crawling every 12 hours (43200000 ms)
crawlInterval = setInterval(() => {
  console.log("\n⏰ Scheduled news crawl triggered...");
  crawlNews().catch(err => {
    console.error("❌ Scheduled crawl failed:", err.message);
  });
}, 12 * 60 * 60 * 1000); // 12 hours

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down server...");
  if (crawlInterval) {
    clearInterval(crawlInterval);
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  process.exit(0);
});

app.listen(PORT, HOST, () => {
  console.log(`🚀 CyberSaathi backend running on http://${HOST}:${PORT}`);
  console.log(`📱 Mobile access: http://YOUR_LAPTOP_IP:${PORT}`);
  console.log(`📰 Auto-crawling enabled: Every 12 hours`);
  console.log(`🎯 Top 6 priority articles: Always the latest and most relevant`);
  console.log(`🔧 Manual crawl: POST /admin/crawl-news`);
});