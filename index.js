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

// Load environment variables
dotenv.config();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HOST = process.env.HOST || "0.0.0.0"; // Bind to all interfaces

const app = express();
const PORT = process.env.PORT || 5000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  throw new Error("GROQ_API_KEY is not set in environment variables");
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Serve static booklets (PDFs)
const BOOKLETS_DIR = path.join(__dirname, "booklets");
app.use("/booklets", express.static(BOOKLETS_DIR));

// Detect explicit language requests from user
function detectExplicitLanguageRequest(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;

  // Get all user messages
  const allUserMessages = messages
    .filter((msg) => msg.role === "user")
    .map((msg) => msg.content?.toLowerCase() || "")
    .join(" ");

  // English request patterns
  const englishRequests = [
    /\b(speak|reply|respond|answer|talk|write|type)\s+(in\s+)?english\b/i,
    /\b(english\s+me|english\s+mein|english\s+language)\b/i,
    /\b(use\s+english|in\s+english|english\s+only)\b/i,
  ];

  // Hindi request patterns
  const hindiRequests = [
    /\b(speak|reply|respond|answer|talk|write|type)\s+(in\s+)?hindi\b/i,
    /\b(hindi\s+me|hindi\s+mein|hindi\s+language)\b/i,
    /\b(use\s+hindi|in\s+hindi|hindi\s+mein\s+bolo|hindi\s+mein\s+likho)\b/i,
    /\b(\u0939\u093f\u0928\u094d\u0926\u0940\s+|\u0939\u093f\u0928\u094d\u0926\u0940\s+\u092e\u0947\u0902)\b/i, // Hindi in Devanagari
  ];

  // Hinglish request patterns
  const hinglishRequests = [
    /\b(speak|reply|respond|answer|talk|write|type)\s+(in\s+)?hinglish\b/i,
    /\b(hinglish\s+me|hinglish\s+mein|hinglish\s+language)\b/i,
    /\b(use\s+hinglish|in\s+hinglish|roman\s+hindi)\b/i,
  ];

  // Check for explicit requests (most recent messages have priority)
  const recentMessages = messages
    .filter((msg) => msg.role === "user")
    .slice(-3) // Check last 3 messages
    .map((msg) => msg.content?.toLowerCase() || "")
    .reverse(); // Most recent first

  for (const msg of recentMessages) {
    if (englishRequests.some((pattern) => pattern.test(msg))) {
      return "en";
    }
    if (hindiRequests.some((pattern) => pattern.test(msg))) {
      return "hi";
    }
    if (hinglishRequests.some((pattern) => pattern.test(msg))) {
      return "hinglish";
    }
  }

  return null; // No explicit request found
}

// Language detection function - analyzes entire conversation
function detectLanguage(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return "en";

  // First, check for explicit language requests (highest priority)
  const explicitLanguage = detectExplicitLanguageRequest(messages);
  if (explicitLanguage) {
    return explicitLanguage;
  }

  // Get all user messages from conversation
  const allUserMessages = messages
    .filter((msg) => msg.role === "user")
    .map((msg) => msg.content || "")
    .join(" ");

  if (!allUserMessages.trim()) return "en";

  // Check for Devanagari script (Hindi, Marathi, etc.)
  const devanagariRegex = /[\u0900-\u097F]/;
  if (devanagariRegex.test(allUserMessages)) {
    return "hi"; // Hindi in Devanagari
  }

  // Check for Hinglish/Roman Hindi patterns
  const hinglishPatterns = [
    /\b(main|tum|aap|kyun|kaise|kya|hai|ho|tha|thi|the|hoga|hogi|honge)\b/gi,
    /\b(mujhe|tujhe|usko|unko|isko|inko|yahan|wahan|idhar|udhar)\b/gi,
    /\b(acha|theek|bilkul|zaroor|sahi|galat|nahi|haan|hain|kab|kaun|kisne)\b/gi,
    /\b(mera|mere|meri|tera|tumhara|apka|unka|iska)\b/gi,
  ];

  const hinglishMatches = hinglishPatterns.reduce(
    (count, pattern) => count + (allUserMessages.match(pattern) || []).length,
    0
  );

  // Calculate ratio of Hinglish words to total words
  const totalWords = allUserMessages.split(/\s+/).length;
  const hinglishRatio = hinglishMatches / Math.max(totalWords, 1);

  // If significant Hinglish detected (3+ matches or >10% ratio), treat as Hinglish
  if (hinglishMatches >= 3 || hinglishRatio > 0.1) {
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

// Generate dynamic system prompt based on language and victim status
function generateSystemPrompt(language, isVictim, explicitRequest = false) {
  const languageInstructions = {
    en: explicitRequest
      ? "User has explicitly requested English. Respond ONLY in English. Use clear, professional English."
      : "Respond in English. Use clear, professional English.",
    hi: explicitRequest
      ? "User has explicitly requested Hindi. Respond ONLY in Hindi (Devanagari script). Use clear, professional Hindi."
      : "Respond in Hindi (Devanagari script). Use clear, professional Hindi.",
    hinglish: explicitRequest
      ? "User has explicitly requested Hinglish. Respond ONLY in Hinglish (Hindi words written in English/Roman script). Match the user's style - use words like 'main', 'tum', 'aap', 'hai', 'hoga', etc. Keep it natural and conversational."
      : "Respond in Hinglish (Hindi words written in English/Roman script). Match the user's style - use words like 'main', 'tum', 'aap', 'hai', 'hoga', etc. Keep it natural and conversational.",
  };

  const victimInstructions = isVictim
    ? `🚨 CRITICAL: User is a VICTIM of cybercrime. 
- IMMEDIATELY start response with: "🚨 URGENT: Call 1930 or file complaint at cybercrime.gov.in immediately"
- Provide immediate action steps FIRST
- Include helpline numbers prominently: 1930 or 0172-2749900
- Mention cybercrime.gov.in for filing complaint
- Be empathetic and urgent in tone
- Focus on immediate steps to secure their account/money
- Then provide detailed guidance`
    : `User is asking for INFORMATION only (not a victim).
- Provide helpful information without urgent helpline emphasis
- Only mention helpline numbers at the end if relevant
- Focus on education and prevention
- Keep tone informative and helpful`;

  return `You are CyberSaathi, Chandigarh Cyber Police's official helpline chatbot for cybercrime assistance.

LANGUAGE RULE:
${languageInstructions[language] || languageInstructions.en}
Stay consistent in the chosen language throughout the conversation.

SCOPE:
ONLY cybersecurity, cybercrime, digital safety topics
Off-topic response: "I'm CyberSaathi - I only help with cybercrime and digital safety questions."

VICTIM STATUS:
${victimInstructions}

RESPONSE FORMAT (Keep under 150 words):
${
  isVictim
    ? "For Cybercrime Victims - Always Start With:\n🚨 URGENT: Call 1930 or file complaint at cybercrime.gov.in immediately\n\nStructure:\n- Immediate Action (2-3 lines)\n- Key Steps (5-6 bullet points max, use • for bullets)\n- Quick Tip (1-3 prevention line)"
    : "For Information Queries:\n- Provide clear, helpful information\n- Use bullet points (•) for clarity\n- Include prevention tips if relevant\n- Mention helpline only if directly relevant"
}

Also do mention if possible the type of scam involved in scenario based queries

EXPERTISE AREAS:
UPI/Online fraud, phishing, digital arrest scams
Sextortion, cyberbullying, identity theft
Social media hacking, OTP fraud, fake apps
Investment scams, job scams, ransomware

FORMATTING RULES:
- Use plain text only, NO markdown formatting (no **, no __, no #, no code blocks)
- Use • for bullet points
- Use emojis sparingly (only for urgent alerts)
- Use ALL CAPS only for urgent warnings
- Keep paragraphs short (2-3 lines max)
- Use line breaks between sections
${
  isVictim
    ? "- Include helpline: 1930 or 0172-2749900\n- Always mention: cybercrime.gov.in"
    : "- Mention helpline numbers only if relevant to the query"
}

TONE:
${
  isVictim
    ? "Professional, urgent, empathetic, action-focused. Show understanding of their distress."
    : "Professional, helpful, informative, educational. Focus on prevention and awareness."
}

IMPORTANT: Format your response as clean plain text. Do not use markdown syntax like **bold** or __italic__. Use simple text formatting with line breaks and bullet points (•).`;
}

function cleanResponse(content) {
  if (!content) return "";

  // Remove <think> tags and their content
  let cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, "");
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/redacted_reasoning>/gi, "");

  // Remove any remaining XML-like tags
  cleaned = cleaned.replace(/<[^>]*>/g, "");

  // Remove markdown formatting
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, "$1"); // Remove **bold**
  cleaned = cleaned.replace(/\*([^*]+)\*/g, "$1"); // Remove *italic*
  cleaned = cleaned.replace(/__([^_]+)__/g, "$1"); // Remove __bold__
  cleaned = cleaned.replace(/_([^_]+)_/g, "$1"); // Remove _italic_
  cleaned = cleaned.replace(/~~([^~]+)~~/g, "$1"); // Remove ~~strikethrough~~
  cleaned = cleaned.replace(/#{1,6}\s+/g, ""); // Remove markdown headers
  cleaned = cleaned.replace(/```[\s\S]*?```/g, ""); // Remove code blocks
  cleaned = cleaned.replace(/`([^`]+)`/g, "$1"); // Remove inline code
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1"); // Remove markdown links, keep text

  // Clean up extra whitespace and newlines
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, "\n\n"); // Max 2 consecutive newlines
  cleaned = cleaned.replace(/[ \t]+/g, " "); // Multiple spaces to single space
  cleaned = cleaned.trim();

  // If response starts with third person references, try to clean them
  cleaned = cleaned.replace(
    /^(The bot|CyberSaathi|The assistant|I as CyberSaathi)/i,
    "I"
  );

  // Ensure proper line breaks for readability
  cleaned = cleaned.replace(/([.!?])\s+([A-Z])/g, "$1\n\n$2"); // Add breaks after sentences starting new paragraphs

  return cleaned;
}

// News storage file path
const NEWS_FILE_PATH = path.join(__dirname, "news_data.json");

// Enhanced news sources with multiple selectors and fallbacks
const NEWS_SOURCES = [
  {
    name: "The Economic Times",
    urls: [
      "https://economictimes.indiatimes.com/topic/cyber-crime",
      "https://economictimes.indiatimes.com/topic/cybersecurity",
      "https://economictimes.indiatimes.com/topic/data-breach",
      "https://economictimes.indiatimes.com/tech/technology",
    ],
    selectors: [
      {
        articles: ".story-box, .eachStory, article",
        title: "h3 a, h2 a, h4 a, .story-title a",
        description: "p, .story-summary",
        link: "h3 a, h2 a, h4 a, .story-title a",
        date: "time, .story-date, .publish-date",
      },
      {
        articles: ".storylist, .news-item",
        title: "a[title], .title a",
        description: ".summary, .desc",
        link: "a[title], .title a",
        date: ".date, .time",
      },
    ],
  },
  {
    name: "The Hindu",
    urls: [
      "https://www.thehindu.com/topic/Cyber-crime/",
      "https://www.thehindu.com/sci-tech/",
      "https://www.thehindu.com/news/national/",
    ],
    selectors: [
      {
        articles: ".story-card, .element, article",
        title: "h3 a, h2 a, .title a",
        description: "p, .intro",
        link: "h3 a, h2 a, .title a",
        date: "time, .date, .publish-time",
      },
    ],
  },
  {
    name: "Times of India",
    urls: [
      "https://timesofindia.indiatimes.com/topic/cyber-crime",
      "https://timesofindia.indiatimes.com/topic/cybersecurity",
      "https://timesofindia.indiatimes.com/tech",
    ],
    selectors: [
      {
        articles: ".news-item, .list5, .content",
        title: "h3 a, h2 a, .w_tle a",
        description: "p, .w_seg",
        link: "h3 a, h2 a, .w_tle a",
        date: "time, .w_dt",
      },
    ],
  },
  {
    name: "Hindustan Times",
    urls: [
      "https://www.hindustantimes.com/topic/cyber-crime",
      "https://www.hindustantimes.com/tech",
      "https://www.hindustantimes.com/india-news",
    ],
    selectors: [
      {
        articles: ".cartHolder, .story-card, .listingPage",
        title: "h3 a, h2 a, .hdg3 a",
        description: "p, .anc",
        link: "h3 a, h2 a, .hdg3 a",
        date: "time, .dateTime",
      },
    ],
  },
  {
    name: "NDTV",
    urls: [
      "https://www.ndtv.com/topic/cyber-crime",
      "https://www.ndtv.com/topic/cybersecurity",
      "https://www.ndtv.com/business/tech",
    ],
    selectors: [
      {
        articles: ".news_Itm, .storylist__item",
        title: "h3 a, h2 a, .storylist__article-title",
        description: "p, .storylist__article-content",
        link: "h3 a, h2 a, .storylist__article-title",
        date: "time, .storylist__article-publish",
      },
    ],
  },
  // Additional fallback sources
  {
    name: "India Today",
    urls: [
      "https://www.indiatoday.in/topic/cyber-crime",
      "https://www.indiatoday.in/technology",
    ],
    selectors: [
      {
        articles: ".storylist-card, .story-card",
        title: "h3 a, h2 a",
        description: "p",
        link: "h3 a, h2 a",
        date: "time, .date",
      },
    ],
  },
];

// Enhanced cyber keywords for better filtering
const CYBER_KEYWORDS = [
  "cyber",
  "hack",
  "fraud",
  "scam",
  "phishing",
  "malware",
  "security",
  "digital",
  "online",
  "crime",
  "attack",
  "breach",
  "vulnerability",
  "password",
  "encryption",
  "firewall",
  "virus",
  "trojan",
  "ransomware",
  "social media",
  "whatsapp",
  "telegram",
  "upi",
  "payment",
  "banking",
  "identity theft",
  "data theft",
  "privacy",
  "surveillance",
  "spyware",
  "cyber police",
  "digital arrest",
  "sextortion",
  "cyberbullying",
  "fake news",
  "misinformation",
  "deepfake",
  "ai fraud",
  "bitcoin",
  "cryptocurrency",
  "blockchain",
  "wallet",
  "trading",
  "investment scam",
  "loan app",
  "instant loan",
  "recovery agent",
  "harassment",
];

async function crawlSourceWithSelectors(source, selectorSet, url) {
  try {
    console.log(`Trying ${source.name} with URL: ${url}`);
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
      timeout: 20000,
    });

    const $ = cheerio.load(response.data);
    const articles = $(selectorSet.articles);
    const foundArticles = [];

    console.log(
      `Found ${articles.length} potential articles with selector: ${selectorSet.articles}`
    );

    articles.each((index, element) => {
      if (index < 15) {
        // Check more articles
        const titleElement = $(element).find(selectorSet.title).first();
        let title = titleElement.text().trim();
        let link = titleElement.attr("href");
        const description = $(element)
          .find(selectorSet.description)
          .first()
          .text()
          .trim();
        const date = $(element).find(selectorSet.date).first().text().trim();

        // Fallback title extraction
        if (!title) {
          title = $(element).find("a").first().text().trim();
          link = $(element).find("a").first().attr("href");
        }

        if (title && link && title.length > 10) {
          // Fix relative URLs
          if (link.startsWith("/")) {
            const baseUrl = new URL(url).origin;
            link = baseUrl + link;
          } else if (!link.startsWith("http")) {
            link = url + "/" + link;
          }

          // Enhanced filtering - more lenient for cyber content
          const contentText = (title + " " + description).toLowerCase();
          const hasCyberContent =
            CYBER_KEYWORDS.some((keyword) => contentText.includes(keyword)) ||
            contentText.includes("police") ||
            contentText.includes("arrest") ||
            contentText.includes("stolen") ||
            contentText.includes("cheat");

          if (hasCyberContent) {
            foundArticles.push({
              title: title,
              description:
                description ||
                "Cybersecurity and crime related news from India",
              url: link,
              publishedAt: new Date().toISOString(),
              source: source.name,
              category: "Cybersecurity",
              crawledAt: new Date().toISOString(),
            });
            console.log(`✓ Found cyber article: ${title.substring(0, 60)}...`);
          }
        }
      }
    });

    return foundArticles;
  } catch (error) {
    console.error(`Error crawling ${source.name} with ${url}:`, error.message);
    return [];
  }
}

async function fetchCyberNewsUntilMinimum(minArticles = 3, maxAttempts = 5) {
  console.log(
    `\n🔄 Starting news crawl - Target: ${minArticles} articles, Max attempts: ${maxAttempts}`
  );
  let allNews = [];
  let attempts = 0;

  while (allNews.length < minArticles && attempts < maxAttempts) {
    attempts++;
    console.log(
      `\n📰 Crawl attempt ${attempts}/${maxAttempts} - Current articles: ${allNews.length}`
    );

    const attemptNews = [];

    for (const source of NEWS_SOURCES) {
      // Try each URL for this source
      for (const url of source.urls) {
        // Try each selector set for this URL
        for (const selectorSet of source.selectors) {
          try {
            const articles = await crawlSourceWithSelectors(
              source,
              selectorSet,
              url
            );
            attemptNews.push(...articles);

            // Add delay between requests
            await new Promise((resolve) => setTimeout(resolve, 1500));

            // Break if we have enough articles from this source
            if (articles.length > 0) break;
          } catch (error) {
            console.error(`Error with ${source.name}:`, error.message);
          }
        }

        // Break if we found articles from this source
        if (attemptNews.some((article) => article.source === source.name))
          break;
      }
    }

    // Remove duplicates and add to main collection
    const uniqueAttemptNews = attemptNews.filter(
      (article, index, self) =>
        index ===
        self.findIndex(
          (a) => a.url === article.url || a.title === article.title
        )
    );

    allNews.push(...uniqueAttemptNews);

    // Remove duplicates from total collection
    allNews = allNews.filter(
      (article, index, self) =>
        index === self.findIndex((a) => a.url === article.url)
    );

    console.log(
      `📊 Attempt ${attempts} result: +${uniqueAttemptNews.length} new articles, Total: ${allNews.length}`
    );

    // If we have enough articles, break
    if (allNews.length >= minArticles) {
      console.log(`✅ Target reached! Found ${allNews.length} articles`);
      break;
    }

    // Wait before next attempt
    if (attempts < maxAttempts && allNews.length < minArticles) {
      console.log(`⏳ Waiting 30 seconds before next attempt...`);
      await new Promise((resolve) => setTimeout(resolve, 30000));
    }
  }

  // If still not enough articles, try to get any tech/crime related news
  if (allNews.length < minArticles) {
    console.log(`⚠️ Still need more articles. Trying broader search...`);

    const broadSources = [
      "https://www.business-standard.com/topic/technology",
      "https://www.livemint.com/technology",
      "https://economictimes.indiatimes.com/tech",
    ];

    for (const url of broadSources) {
      try {
        const response = await axios.get(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          timeout: 15000,
        });

        const $ = cheerio.load(response.data);
        const articles = $("article, .story-card, .news-item").slice(0, 10);

        articles.each((index, element) => {
          const title = $(element)
            .find("h1, h2, h3, h4, a")
            .first()
            .text()
            .trim();
          const link = $(element).find("a").first().attr("href");

          if (title && link && title.length > 10) {
            const fullLink = link.startsWith("/")
              ? new URL(url).origin + link
              : link;

            // More lenient filtering for fallback
            const contentText = title.toLowerCase();
            if (
              contentText.includes("tech") ||
              contentText.includes("digital") ||
              contentText.includes("online") ||
              contentText.includes("security") ||
              contentText.includes("crime") ||
              contentText.includes("fraud")
            ) {
              allNews.push({
                title: title,
                description: "Technology and security related news",
                url: fullLink,
                publishedAt: new Date().toISOString(),
                source: "Fallback Source",
                category: "Technology",
                crawledAt: new Date().toISOString(),
                isFallback: true,
              });
            }
          }
        });

        await new Promise((resolve) => setTimeout(resolve, 2000));

        if (allNews.length >= minArticles) break;
      } catch (error) {
        console.error("Broad search error:", error.message);
      }
    }
  }

  // Final deduplication and sorting
  const uniqueNews = allNews
    .filter(
      (article, index, self) =>
        index === self.findIndex((a) => a.url === article.url)
    )
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  const newsData = {
    lastUpdated: new Date().toISOString(),
    articles: uniqueNews.slice(0, 20), // Keep top 20 articles
    crawlAttempts: attempts,
    targetMet: uniqueNews.length >= minArticles,
  };

  // Save to file
  try {
    fs.writeFileSync(NEWS_FILE_PATH, JSON.stringify(newsData, null, 2));
    console.log(
      `💾 News saved successfully. Final count: ${uniqueNews.length} articles`
    );
  } catch (saveError) {
    console.error("Error saving news:", saveError.message);
  }

  console.log(
    `\n🎯 Crawl completed: ${uniqueNews.length} articles found in ${attempts} attempts`
  );
  return newsData;
}

// Function to get stored news
function getStoredNews() {
  try {
    if (fs.existsSync(NEWS_FILE_PATH)) {
      const data = fs.readFileSync(NEWS_FILE_PATH, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading news file:", error.message);
  }
  return null;
}

// Function to check if news needs updating (12 hours)
function shouldUpdateNews() {
  const storedNews = getStoredNews();
  if (!storedNews || !storedNews.lastUpdated) return true;

  const lastUpdate = new Date(storedNews.lastUpdated);
  const now = new Date();
  const hoursDiff = (now - lastUpdate) / (1000 * 60 * 60);

  return hoursDiff >= 12; // Changed from 3 minutes to 12 hours
}

// Function to check if we have enough news (at least 3 articles)
function hasEnoughNews() {
  const storedNews = getStoredNews();
  return storedNews && storedNews.articles && storedNews.articles.length >= 3;
}

// Function to clean up old news data
function cleanupNewsData() {
  try {
    const newsData = getStoredNews();
    if (!newsData) return;

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

    // Remove articles older than 7 days
    const filteredArticles = newsData.articles.filter((article) => {
      const articleDate = new Date(article.publishedAt);
      return articleDate > oneWeekAgo;
    });

    // Keep only 6 articles maximum
    const cleanedArticles = filteredArticles.slice(0, 6);

    // Update the JSON file with cleaned data
    const cleanedNewsData = {
      lastUpdated: new Date().toISOString(),
      articles: cleanedArticles,
      crawlAttempts: newsData.crawlAttempts || 0,
      targetMet: cleanedArticles.length >= 3,
      lastCleanup: new Date().toISOString(),
    };

    fs.writeFileSync(NEWS_FILE_PATH, JSON.stringify(cleanedNewsData, null, 2));
    console.log(
      `🧹 Cleanup completed: Removed ${
        newsData.articles.length - cleanedArticles.length
      } old articles, kept ${cleanedArticles.length} articles`
    );
  } catch (error) {
    console.error("❌ Error during cleanup:", error.message);
  }
}

async function fetchCyberNews() {
  try {
    const allNews = [];

    for (const source of NEWS_SOURCES) {
      try {
        console.log(`Crawling ${source.name}...`);
        const response = await axios.get(source.url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          },
          timeout: 15000,
        });

        const $ = cheerio.load(response.data);
        const articles = $(source.selectors.articles);

        articles.each((index, element) => {
          if (index < 12) {
            // Increased limit to get more articles
            const titleElement = $(element)
              .find(source.selectors.title)
              .first();
            const title = titleElement.text().trim();
            const link = titleElement.attr("href");
            const description = $(element)
              .find(source.selectors.description)
              .first()
              .text()
              .trim();
            const date = $(element)
              .find(source.selectors.date)
              .first()
              .text()
              .trim();

            if (title && link) {
              // Enhanced filtering for cybersecurity-related content
              const cyberKeywords = [
                "cyber",
                "hack",
                "fraud",
                "scam",
                "phishing",
                "malware",
                "security",
                "digital",
                "online",
                "crime",
                "attack",
                "breach",
                "vulnerability",
                "password",
                "encryption",
                "firewall",
                "virus",
                "trojan",
                "ransomware",
                "social media",
                "whatsapp",
                "telegram",
                "upi",
                "payment",
                "banking",
                "data",
                "privacy",
                "information",
                "network",
                "internet",
                "web",
              ];
              const hasCyberContent = cyberKeywords.some(
                (keyword) =>
                  title.toLowerCase().includes(keyword) ||
                  description.toLowerCase().includes(keyword)
              );

              if (hasCyberContent) {
                allNews.push({
                  title: title,
                  description: description || "Cybersecurity news from India",
                  url: link.startsWith("http")
                    ? link
                    : `https://${source.name
                        .toLowerCase()
                        .replace(/\s+/g, "")}.com${link}`,
                  publishedAt: new Date().toISOString(),
                  source: source.name,
                  category: "Cybersecurity",
                });
              }
            }
          }
        });

        // Add delay between requests to be respectful
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Error crawling ${source.name}:`, error.message);
      }
    }

    // Remove duplicates and sort by date
    const uniqueNews = allNews
      .filter(
        (article, index, self) =>
          index === self.findIndex((a) => a.url === article.url)
      )
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    // Save to file
    const newsData = {
      lastUpdated: new Date().toISOString(),
      articles: uniqueNews.slice(0, 15), // Keep top 15 articles
    };

    fs.writeFileSync(NEWS_FILE_PATH, JSON.stringify(newsData, null, 2));
    console.log(
      `News crawled and updated successfully. Found ${uniqueNews.length} articles.`
    );

    return newsData;
  } catch (error) {
    console.error("Error crawling news:", error.message);
    return null;
  }
}

// Function to crawl until we get enough news
async function crawlUntilEnoughNews() {
  let attempts = 0;
  const maxAttempts = 5; // Try up to 5 times

  while (attempts < maxAttempts && !hasEnoughNews()) {
    console.log(`🔄 Crawling attempt ${attempts + 1}/${maxAttempts}...`);
    await fetchCyberNewsUntilMinimum(3, 2); // Minimum 3 articles, max 2 attempts per crawl
    attempts++;

    // Wait 30 seconds before next attempt
    if (attempts < maxAttempts && !hasEnoughNews()) {
      console.log(`⏳ Waiting 30 seconds before next attempt...`);
      await new Promise((resolve) => setTimeout(resolve, 30000));
    }
  }

  if (hasEnoughNews()) {
    console.log("✅ Successfully crawled enough news articles.");
  } else {
    console.log("⚠️ Could not crawl enough news after all attempts.");
  }
}

// Enhanced automatic news crawling with minimum guarantee
let isCrawlingInProgress = false;
let crawlInterval;
let cleanupInterval;

async function performScheduledCrawl() {
  if (isCrawlingInProgress) {
    console.log("⏭️ Crawling already in progress, skipping this interval");
    return;
  }

  try {
    isCrawlingInProgress = true;
    const storedNews = getStoredNews();
    const articleCount = storedNews?.articles?.length || 0;

    console.log(
      `\n🔍 Scheduled crawl check - Current articles: ${articleCount}`
    );

    // Always crawl every 12 hours to get fresh news
    console.log("📰 Starting scheduled news crawl...");
    await fetchCyberNewsUntilMinimum(3, 2); // Minimum 3 articles, max 2 attempts

    // Clean up the JSON file after crawling
    console.log("🧹 Performing automatic cleanup...");
    cleanupNewsData();

    console.log("✅ Scheduled news crawl completed");
  } catch (error) {
    console.error("❌ Scheduled crawl error:", error.message);
  } finally {
    isCrawlingInProgress = false;
  }
}

// Start scheduled crawling (every 12 hours)
crawlInterval = setInterval(performScheduledCrawl, 12 * 60 * 60 * 1000);

// Start cleanup interval (every 24 hours)
cleanupInterval = setInterval(() => {
  console.log("🧹 Starting scheduled cleanup...");
  cleanupNewsData();
}, 24 * 60 * 60 * 1000);

// Initial news crawl on startup
console.log("🚀 Starting initial news crawl on server startup...");
performScheduledCrawl()
  .then(() => {
    console.log("✅ Initial news crawl completed");
  })
  .catch((error) => {
    console.error("❌ Initial news crawl failed:", error.message);
  });

// Update news endpoint
app.get("/update-news", async (req, res) => {
  try {
    const newsData = await fetchCyberNewsUntilMinimum(3, 3);
    if (newsData && newsData.articles.length > 0) {
      res.json({
        success: true,
        message: `News updated successfully. Found ${newsData.articles.length} articles.`,
        data: newsData,
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to find minimum news articles",
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /chat endpoint
app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid messages array" });
    }

    // Check if we have a valid API key
    if (!process.env.GROQ_API_KEY || GROQ_API_KEY === "dummy_key_for_testing") {
      return res.json({
        success: true,
        response:
          "I'm CyberSaathi, your cyber safety assistant. I'm currently in maintenance mode. Please contact the administrator to set up the AI service properly. For immediate cybercrime assistance, call Chandigarh Cyber Helpline 1930 or 0172-2749900.",
      });
    }

    // Detect language from entire conversation (includes explicit requests)
    const explicitLanguageRequest = detectExplicitLanguageRequest(messages);
    const detectedLanguage = detectLanguage(messages);
    const lastUserMessage =
      messages.filter((msg) => msg.role === "user").pop()?.content || "";

    // Detect if user is a victim
    const isVictim = detectVictimStatus(messages);

    // Generate dynamic system prompt based on language and victim status
    const dynamicSystemPrompt = generateSystemPrompt(
      detectedLanguage,
      isVictim,
      explicitLanguageRequest !== null // True if explicit request was made
    );

    // Log detection results for debugging
    console.log(
      `Language: ${detectedLanguage}${
        explicitLanguageRequest ? " (explicitly requested)" : ""
      }, Victim: ${isVictim}, Message preview: ${lastUserMessage.substring(
        0,
        50
      )}...`
    );

    // Prepend the dynamic system prompt
    const groqMessages = [
      { role: "system", content: dynamicSystemPrompt },
      ...messages,
    ];

    // Call Groq API - Try GPT OSS 20B first, fallback to Llama 3.3 70B if not available
    // Model names to try in order of preference (cost-effective first)
    const modelOptions = [
      "openai/gpt-oss-20b", // GPT OSS 20B - cheapest option
      "llama-3.3-70b-versatile", // Original working model - fallback
    ];

    let groqResponse;
    let lastError;

    for (const model of modelOptions) {
      try {
        groqResponse = await axios.post(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            model: model,
            messages: groqMessages,
            max_tokens: 1024,
            temperature: 0.3, // Lower temperature for more focused responses
            top_p: 0.9,
            stream: false,
          },
          {
            headers: {
              Authorization: `Bearer ${GROQ_API_KEY}`,
              "Content-Type": "application/json",
            },
          }
        );
        // If successful, break out of loop
        break;
      } catch (error) {
        lastError = error;
        // If model not found, try next model
        if (error?.response?.data?.error?.code === "model_not_found") {
          console.log(`Model ${model} not found, trying next option...`);
          continue;
        }
        // For other errors, throw immediately
        throw error;
      }
    }

    // If all models failed, throw the last error
    if (!groqResponse) {
      throw lastError || new Error("All model options failed");
    }

    const rawResponse = groqResponse.data.choices?.[0]?.message?.content || "";
    const cleanedResponse = cleanResponse(rawResponse);

    res.json({ success: true, response: cleanedResponse });
  } catch (error) {
    console.error("Chat error:", error?.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: "Failed to get response from AI assistant.",
    });
  }
});

// Add /health endpoint
app.get("/health", (req, res) => {
  const newsData = getStoredNews();
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      ai: true,
      urlScanner: true,
      news: true,
    },
    newsInfo: {
      articlesCount: newsData?.articles?.length || 0,
      lastUpdated: newsData?.lastUpdated,
      targetMet: newsData?.targetMet || false,
    },
  });
});

// Add /scan-url endpoint (dummy implementation)
app.post("/scan-url", (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: "No URL provided" });
  }
  // Dummy scan result
  res.json({
    success: true,
    result: {
      url,
      status: "completed",
      riskLevel: "safe",
      threats: [],
      scanTime: new Date().toISOString(),
      details: {
        malicious: 0,
        suspicious: 0,
        harmless: 20,
        undetected: 5,
      },
    },
  });
});

// List available booklets
app.get("/booklets", (req, res) => {
  try {
    // Protocol and host to build absolute URLs
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.get("host");
    const base = `${protocol}://${host}`;

    if (!fs.existsSync(BOOKLETS_DIR)) {
      return res.json({ success: true, booklets: [] });
    }

    const files = fs
      .readdirSync(BOOKLETS_DIR)
      .filter((f) => f.toLowerCase().endsWith(".pdf"));

    const formatSize = (bytes) => {
      const mb = bytes / (1024 * 1024);
      if (mb >= 0.1) return `${mb.toFixed(1)} MB`;
      const kb = bytes / 1024;
      return `${Math.max(1, Math.round(kb))} KB`;
    };

    const booklets = files.map((filename, idx) => {
      const stat = fs.statSync(path.join(BOOKLETS_DIR, filename));
      return {
        id: String(idx + 1),
        title: filename.replace(/_/g, " ").replace(/\.[Pp][Dd][Ff]$/, ""),
        filename,
        fileUrl: `${base}/booklets/${encodeURIComponent(filename)}`,
        size: formatSize(stat.size),
      };
    });

    res.json({ success: true, booklets });
  } catch (err) {
    console.error("Error listing booklets:", err.message);
    res.status(500).json({ success: false, error: "Failed to list booklets" });
  }
});

// Test endpoint to manually trigger crawling
app.get("/test-crawl", async (req, res) => {
  try {
    console.log("🧪 Manual crawl test triggered");
    const beforeCount = getStoredNews()?.articles?.length || 0;

    await crawlUntilEnoughNews();

    const afterCount = getStoredNews()?.articles?.length || 0;

    res.json({
      success: true,
      message: `Crawl test completed. Articles: ${beforeCount} → ${afterCount}`,
      beforeCount,
      afterCount,
      hasEnough: hasEnoughNews(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add /news endpoint (real implementation)
app.get("/news", async (req, res) => {
  try {
    console.log("📡 News request received from frontend");

    // Always get the latest news from JSON file
    const newsData = getStoredNews();
    if (newsData && newsData.articles && newsData.articles.length > 0) {
      console.log(
        `📰 Serving ${newsData.articles.length} articles to frontend (max 6 shown)`
      );
      res.json({
        success: true,
        articles: newsData.articles.slice(0, 6), // Return max 6 articles
      });
    } else {
      // If no news is available, trigger immediate crawl
      console.log(
        "⚠️ No news articles available, triggering immediate crawl..."
      );
      await performScheduledCrawl();

      const freshNewsData = getStoredNews();
      if (
        freshNewsData &&
        freshNewsData.articles &&
        freshNewsData.articles.length > 0
      ) {
        console.log(
          `📰 Serving ${freshNewsData.articles.length} fresh articles to frontend`
        );
        res.json({
          success: true,
          articles: freshNewsData.articles.slice(0, 6),
        });
      } else {
        console.log("⚠️ Still no news articles available for frontend");
        res.json({
          success: true,
          articles: [],
        });
      }
    }
  } catch (error) {
    console.error("❌ Error serving news to frontend:", error.message);
    res.json({
      success: true,
      articles: [],
    });
  }
});

// Manual cleanup endpoint for testing
app.get("/cleanup-news", (req, res) => {
  try {
    console.log("🧹 Manual cleanup triggered");
    const beforeCount = getStoredNews()?.articles?.length || 0;

    cleanupNewsData();

    const afterCount = getStoredNews()?.articles?.length || 0;

    res.json({
      success: true,
      message: `Cleanup completed. Articles: ${beforeCount} → ${afterCount}`,
      beforeCount,
      afterCount,
      hasEnough: hasEnoughNews(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Status endpoint to check crawling and article status
app.get("/news-status", (req, res) => {
  const newsData = getStoredNews();
  const currentTime = new Date().toISOString();

  res.json({
    success: true,
    status: {
      currentTime,
      articlesCount: newsData?.articles?.length || 0,
      lastUpdated: newsData?.lastUpdated,
      lastCleanup: newsData?.lastCleanup,
      targetMet: newsData?.targetMet || false,
      hasEnoughNews: hasEnoughNews(),
      isCrawlingInProgress,
      nextCrawlIn: "12 hours",
      nextCleanupIn: "24 hours",
    },
  });
});

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
  console.log(`🎯 Target: Minimum 3 news articles per crawl`);
});
