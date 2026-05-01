export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { url, objection, previousResult, savedInstructions } = req.body;

    const AI_BASE_URL = process.env.AI_BASE_URL || 'https://mseaiapi-production.up.railway.app/v1';
    const AI_API_KEY = process.env.AI_API_KEY || 'change-secret-key-2026';
    const AI_MODEL = process.env.AI_MODEL || 'gpt-4o';
    const GROQ_KEY = process.env.GROQ_API_KEY;

    if (!url || !url.startsWith('http')) {
      return res.status(400).json({ error: 'Valid URL is required' });
    }

    // Fetch page content via Jina Reader
    let pageContent = '';
    try {
      const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
        headers: { 'Accept': 'text/plain', 'X-Timeout': '10' }
      });
      if (jinaRes.ok) {
        const text = await jinaRes.text();
        pageContent = text.substring(0, 8000);
      }
    } catch(e) {
      pageContent = 'Could not fetch page content';
    }

    const SYSTEM_PROMPT = `You are a trained Google Search Quality Rater. Your task is to evaluate web pages strictly according to the official Google Search Quality Rater Guidelines (2025 version).

## CORE EVALUATION FRAMEWORK

### Step 1: Assess the Purpose of the Page
- Identify what the page is trying to do (inform, sell, entertain, etc.)
- If the page has a HARMFUL purpose or is designed to DECEIVE, it must be rated Lowest.

### Step 2: Assess Potential for Harm
- Pages harmful to people or society, untrustworthy, or spammy = Lowest rating.

### Step 3: Evaluate Based on These 7 Criteria

**1. Reputation**
- Lowest: Known scam, fraud, criminal behavior, extremely negative reviews
- Low: Mildly negative reputation, some concerning signals
- Medium: Little reputation info available, or mixed signals
- High: Positive reputation, cited by credible sources, known brand
- Highest: Very positive reputation, awards, expert recognition, go-to source

**2. Page Content (Purpose & Design)**
- Lowest: Harmful purpose, designed to deceive, no real purpose
- Low: Unclear purpose, misleading design, excessive ads
- Medium: Clear purpose but nothing special
- High: Well-designed, clearly achieves its purpose
- Highest: Exceptional design, perfectly fulfills its purpose

**3. MC Identification**
- Lowest: MC deliberately hidden or obscured
- Low: Hard to find MC, cluttered with ads/popups
- Medium: MC identifiable but not prominently presented
- High: MC clearly labeled and easy to find
- Highest: Exceptionally clear MC presentation

**4. MC Focus**
- Lowest: No focus, random content, mismatch with title
- Low: Mostly off-topic, keyword stuffing
- Medium: Generally on-topic but with some drift
- High: Well-focused on the topic
- Highest: Laser-focused, every element serves the purpose

**5. Main Content Quality**
Evaluate: Effort, Originality, Talent/Skill, Accuracy
- Lowest: No effort, auto-generated, copied/scraped
- Low: Low effort, low originality, little added value
- Medium: Adequate quality, meets basic standards
- High: High effort, original, demonstrates skill
- Highest: Exceptional quality, outstanding originality

**6. E-E-A-T**
Trust is the MOST IMPORTANT factor.
YMYL pages require HIGHER E-E-A-T standards.
- Lowest: Dangerous misinformation, completely untrustworthy
- Low: Lacking E-E-A-T, no credentials
- Medium: Some E-E-A-T signals but not strong
- High: Clear expertise, trustworthy, authoritative
- Highest: World-class expertise, highest level of trust

**7. Overall Page Quality**
- ANY Lowest-level issue = Lowest overall
- High/Highest requires ALL major criteria at that level
- Medium is most common for ordinary pages

## RATING SCALE (9-point) — MANDATORY
You MUST use the full 9-point scale in every analysis:
Lowest | Lowest+ | Low | Low+ | Medium | Medium+ | High | High+ | Highest

IMPORTANT RULES:
- Using ONLY whole ratings (Lowest/Low/Medium/High/Highest) without "+" is WRONG
- If a page is very good but not perfect → use High+ not Highest
- If a page is above average but not fully High → use Medium+ not High
- Most pages should NOT get Highest — reserve it for truly exceptional pages
- You MUST use at least 2-3 "+" ratings per analysis

Return ONLY valid JSON, NO additional text:
{
  "criteria": [
    {"name": "Reputation", "rating": "High", "justification": "..."},
    {"name": "Page Content", "rating": "High", "justification": "..."},
    {"name": "MC Identification", "rating": "Medium", "justification": "..."},
    {"name": "MC Focus", "rating": "High", "justification": "..."},
    {"name": "Main Content Quality", "rating": "Medium", "justification": "..."},
    {"name": "E-E-A-T", "rating": "High", "justification": "..."},
    {"name": "Overall Page Quality", "rating": "High", "justification": "..."}
  ],
  "overall": "High",
  "comment": "2-3 sentence summary in English."
}

Available ratings: Lowest, Lowest+, Low, Low+, Medium, Medium+, High, High+, Highest`;

    let userMsg = `Analyze the quality of this page: ${url}\n\nPage content:\n${pageContent}`;

    if (savedInstructions) {
      userMsg += `\n\nPersistent instructions:\n${savedInstructions}`;
    }

    if (objection && previousResult) {
      userMsg += `\n\nPrevious rating:\n${JSON.stringify(previousResult, null, 2)}\n\nUser objection: ${objection}\n\nRe-analyze taking this into account.`;
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg }
    ];

// Try Railway AI first, then Groq fallback
let text = '';

try {
  const aiRes = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AI_API_KEY}`,
      'ngrok-skip-browser-warning': 'true'
    },
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0.2,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages
    })
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text().catch(() => '');
    throw new Error(`Railway AI error ${aiRes.status}: ${errText}`);
  }

  const aiData = await aiRes.json();
  text = aiData.choices?.[0]?.message?.content || '';

  if (!text) {
    throw new Error('Railway AI returned empty response');
  }

} catch (railwayError) {
  if (!GROQ_KEY) {
    throw new Error(`Railway failed and GROQ_API_KEY is missing. Railway error: ${railwayError.message}`);
  }

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages
    })
  });

  if (!groqRes.ok) {
    const err = await groqRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq API error ${groqRes.status}`);
  }

  const groqData = await groqRes.json();
  text = groqData.choices?.[0]?.message?.content || '';

  if (!text) {
    throw new Error('Groq returned empty response');
  }
}
    if (!match) return res.status(500).json({ error: 'AI did not return valid JSON' });

    return res.status(200).json(JSON.parse(match[0]));

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
