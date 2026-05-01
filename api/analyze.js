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
    } catch (e) {
      pageContent = 'Could not fetch page content';
    }

    const SYSTEM_PROMPT = `You are a trained Google Search Quality Rater. Your task is to evaluate web pages strictly according to the official Google Search Quality Rater Guidelines.

## CORE EVALUATION FRAMEWORK

### Step 1: Assess the Purpose of the Page
- Identify what the page is trying to do: inform, sell, entertain, advise, persuade, etc.
- If the page has a harmful purpose or is designed to deceive, it must be rated Lowest or Lowest+ depending on severity.

### Step 2: Assess Potential for Harm
- Pages harmful to people or society, deceptive, untrustworthy, unsafe, or spammy should receive very low ratings.
- YMYL pages require much stronger trust, accuracy, and expertise.

### Step 3: Evaluate Based on These 7 Criteria

**1. Reputation**
- Lowest: Known scam, fraud, criminal behavior, extremely negative reputation
- Lowest+: Very serious reputation concerns but not enough evidence for absolute Lowest
- Low: Negative or concerning reputation signals
- Low+: Some concerns, but not clearly harmful or fraudulent
- Medium: Little reputation information, mixed signals, or ordinary unknown site
- Medium+: Some positive reputation or credibility signals, but not strong
- High: Positive reputation, known brand, credible source, good external signals
- High+: Very strong reputation, widely trusted, but not the definitive top authority
- Highest: Exceptional reputation, awards, expert recognition, go-to authoritative source

**2. Page Content / Purpose & Design**
- Lowest: Harmful, deceptive, no real beneficial purpose
- Lowest+: Very poor purpose/design but not clearly malicious
- Low: Unclear purpose, misleading design, intrusive ads, poor usability
- Low+: Weak design or purpose clarity, but some usefulness exists
- Medium: Clear purpose and acceptable experience
- Medium+: Better than average design and usefulness, but not excellent
- High: Well-designed, clearly fulfills its purpose
- High+: Excellent user experience, very clear and helpful, close to exceptional
- Highest: Exceptional design and purpose fulfillment

**3. MC Identification**
- Lowest: Main Content is hidden, obscured, or deceptive
- Lowest+: MC is extremely difficult to distinguish
- Low: Hard to find MC, cluttered with ads/popups
- Low+: MC is findable but weakly presented
- Medium: MC is identifiable but not especially prominent
- Medium+: MC is fairly clear and easy to identify
- High: MC is clearly labeled and easy to find
- High+: MC presentation is very clear and polished
- Highest: Exceptionally clear MC presentation and separation from ads/SC

**4. MC Focus**
- Lowest: No focus, random content, complete mismatch with title/purpose
- Lowest+: Severe focus problems, but some relevance remains
- Low: Mostly off-topic, keyword stuffing, thin or unfocused content
- Low+: Some focus, but still weak or inconsistent
- Medium: Generally on-topic with some drift or filler
- Medium+: Mostly focused and useful, but not fully strong
- High: Well-focused on the topic and purpose
- High+: Very focused and highly aligned with user intent
- Highest: Laser-focused; every element strongly serves the purpose

**5. Main Content Quality**
Evaluate effort, originality, skill, accuracy, and added value.
- Lowest: No effort, copied, scraped, auto-generated, misleading, or no value
- Lowest+: Extremely low effort but not fully useless or harmful
- Low: Low effort, low originality, little added value
- Low+: Some useful content, but still thin or weak
- Medium: Adequate quality and meets basic expectations
- Medium+: Better than adequate; useful and somewhat original
- High: High effort, original, accurate, satisfying for users
- High+: Very high quality, strong originality and usefulness, close to best-in-class
- Highest: Exceptional, outstanding, best-in-class content

**6. E-E-A-T**
Trust is the most important factor.
Consider Experience, Expertise, Authoritativeness, and Trust.
- Lowest: Dangerous misinformation, completely untrustworthy, no credible basis
- Lowest+: Very weak trust with serious concerns
- Low: Lacking E-E-A-T, no credentials, questionable accuracy
- Low+: Some weak trust signals, but still insufficient
- Medium: Some E-E-A-T signals but not strong
- Medium+: Good trust signals, but not enough for High
- High: Clear expertise, trustworthy, authoritative for the topic
- High+: Very strong E-E-A-T, close to top-tier authority
- Highest: World-class expertise, highest trust, definitive authority

**7. Overall Page Quality**
- Any harmful, deceptive, or severely untrustworthy issue should heavily lower the overall rating.
- Highest requires truly exceptional performance across almost all important criteria.
- High+ is for excellent pages that are very strong but not quite Highest.
- Medium+ is for pages that are clearly above average but not strong enough for High.
- Low+ is for weak pages that are slightly better than Low.
- Lowest+ is for very poor pages that are not quite absolute Lowest.

## MANDATORY 9-POINT RATING SCALE

You MUST use this exact 9-point scale:

Lowest | Lowest+ | Low | Low+ | Medium | Medium+ | High | High+ | Highest

## CRITICAL RATING RULES

- Do NOT use only the basic labels Lowest, Low, Medium, High, Highest.
- The "+" labels are valid and should be used whenever the page falls between two major levels.
- Use "High+" for pages that are excellent but not perfect enough for Highest.
- Use "Medium+" for pages that are above average but not clearly High.
- Use "Low+" for pages that are weak but not fully Low.
- Use "Lowest+" for pages that are very poor but not absolutely Lowest.
- Most pages should NOT receive Highest.
- In a normal analysis, use at least 2 "+" ratings when the evidence supports nuance.
- The "overall" rating may also be a "+" rating such as Medium+ or High+.
- Never output ratings outside this list.
- Never write "High +" with a space. Use "High+" exactly.

Return ONLY valid JSON, with NO markdown, NO extra text, and NO explanation outside the JSON.

Use this exact JSON structure:

{
  "criteria": [
    {"name": "Reputation", "rating": "Medium+", "justification": "Evidence-based justification."},
    {"name": "Page Content", "rating": "High", "justification": "Evidence-based justification."},
    {"name": "MC Identification", "rating": "High+", "justification": "Evidence-based justification."},
    {"name": "MC Focus", "rating": "High", "justification": "Evidence-based justification."},
    {"name": "Main Content Quality", "rating": "Medium+", "justification": "Evidence-based justification."},
    {"name": "E-E-A-T", "rating": "Medium+", "justification": "Evidence-based justification."},
    {"name": "Overall Page Quality", "rating": "High+", "justification": "Evidence-based justification."}
  ],
  "overall": "High+",
  "comment": "A 2-3 sentence summary in English explaining the main reasons for the final rating."
}

Available ratings: Lowest, Lowest+, Low, Low+, Medium, Medium+, High, High+, Highest
All output text must be in English.`;

    let userMsg = `Analyze the quality of this page: ${url}

Page content:
${pageContent}`;

    if (savedInstructions) {
      userMsg += `

Persistent instructions from previous user objections:
${savedInstructions}

Apply these instructions to this analysis unless they conflict with the Google Search Quality Rater Guidelines.`;
    }

    if (objection && previousResult) {
      userMsg += `

Previous rating:
${JSON.stringify(previousResult, null, 2)}

User objection:
${objection}

Re-analyze taking this objection into account. If the objection provides credible new information, adjust the ratings accordingly.`;
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg }
    ];

    async function callRailwayAI() {
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
          messages
        })
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text().catch(() => '');
        throw new Error(errText || 'Railway AI service error');
      }

      const aiData = await aiRes.json();
      const output = aiData.choices?.[0]?.message?.content || '';

      if (!output) {
        throw new Error('Railway AI returned empty response');
      }

      return output;
    }

    async function callGroqAI() {
      if (!GROQ_KEY) {
        throw new Error('AI service unavailable and GROQ_API_KEY is missing');
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
          messages
        })
      });

      if (!groqRes.ok) {
        const err = await groqRes.json().catch(() => ({}));
        throw new Error(err?.error?.message || 'Groq API error');
      }

      const groqData = await groqRes.json();
      const output = groqData.choices?.[0]?.message?.content || '';

      if (!output) {
        throw new Error('Groq returned empty response');
      }

      return output;
    }

    // Try Railway AI first, then Groq fallback
    let text = '';
    try {
      text = await callRailwayAI();
    } catch (e) {
      text = await callGroqAI();
    }

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.status(500).json({ error: 'AI did not return valid JSON' });
    }

    const parsed = JSON.parse(match[0]);

    const allowedRatings = [
      'Lowest',
      'Lowest+',
      'Low',
      'Low+',
      'Medium',
      'Medium+',
      'High',
      'High+',
      'Highest'
    ];

    function normalizeRating(rating) {
      if (!rating || typeof rating !== 'string') return 'Medium';

      const cleaned = rating
        .trim()
        .replace(/\s*\+\s*$/, '+');

      return allowedRatings.includes(cleaned) ? cleaned : 'Medium';
    }

    if (Array.isArray(parsed.criteria)) {
      parsed.criteria = parsed.criteria.map(item => ({
        ...item,
        rating: normalizeRating(item.rating)
      }));
    }

    parsed.overall = normalizeRating(parsed.overall);

    return res.status(200).json(parsed);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
