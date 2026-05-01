exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { url, objection, previousResult } = JSON.parse(event.body);
    const GROQ_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'GROQ_API_KEY not found in Environment Variables' }) };
    }

    // Step 1: Fetch page content via Jina Reader
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

---

**1. Reputation**
Research the reputation of the website and content creator.
- Lowest: Known scam, fraud, criminal behavior, extremely negative reviews
- Low: Mildly negative reputation, some concerning signals
- Medium: Little reputation info available, or mixed signals
- High: Positive reputation, cited by credible sources, known brand
- Highest: Very positive reputation, awards, expert recognition, go-to source

**2. Page Content (Purpose & Design)**
Does the page serve a clear, helpful purpose?
- Lowest: Harmful purpose, designed to deceive, no real purpose
- Low: Unclear purpose, misleading design, excessive ads that interfere with MC
- Medium: Clear purpose but nothing special
- High: Well-designed, clearly achieves its purpose, good user experience
- Highest: Exceptional design, perfectly fulfills its purpose

**3. MC Identification (Main Content Identification)**
Can users easily identify the Main Content vs Ads vs Supplementary Content?
- Lowest: MC is deliberately hidden or obscured, impossible to distinguish
- Low: Hard to find MC, cluttered with ads/popups
- Medium: MC is identifiable but not prominently presented
- High: MC is clearly labeled and easy to find
- Highest: Exceptionally clear MC presentation, perfect separation from ads/SC

**4. MC Focus**
Does the Main Content stay focused on its stated purpose?
- Lowest: No focus, random content, complete mismatch with title/purpose
- Low: Mostly off-topic, keyword stuffing, thin content with no focus
- Medium: Generally on-topic but with some drift or filler
- High: Well-focused on the topic, content matches purpose
- Highest: Laser-focused, every element serves the page's purpose

**5. Main Content Quality**
Evaluate based on: Effort, Originality, Talent/Skill, Accuracy (for informational pages)
- Lowest: No effort, auto-generated, copied/scraped, no added value
- Low: Low effort, low originality, little added value for visitors
- Medium: Adequate quality, meets basic standards, nothing outstanding
- High: High effort, original, demonstrates skill, satisfying for users
- Highest: Exceptional quality, outstanding originality, best-in-class content

**6. E-E-A-T (Experience, Expertise, Authoritativeness, Trust)**
Trust is the MOST IMPORTANT factor. Consider:
- Experience: Does the creator have first-hand experience with the topic?
- Expertise: Does the creator have the necessary knowledge/skill?
- Authoritativeness: Is this a recognized go-to source for this topic?
- Trust: Is the page accurate, honest, safe, and reliable?

YMYL pages (health, finance, legal, safety) require HIGHER E-E-A-T standards.

- Lowest: Lowest E-E-A-T, dangerous misinformation, completely untrustworthy
- Low: Lacking E-E-A-T, no credentials, questionable accuracy
- Medium: Some E-E-A-T signals but not strong
- High: Clear expertise demonstrated, trustworthy, authoritative in its field
- Highest: World-class expertise, highest level of trust, definitive authority

**7. Overall Page Quality**
The holistic assessment based on all factors above. Key rule:
- ANY Lowest-level issue in harm, deception, or trustworthiness = Lowest overall
- High/Highest requires ALL major criteria to be at that level
- Medium is the most common rating for ordinary pages that work fine

---

## RATING SCALE DEFINITIONS
- **Lowest**: Harmful, deceptive, untrustworthy, or completely fails its purpose
- **Low**: Missing E-E-A-T, low quality MC, mildly negative reputation
- **Medium**: OK page, nothing special, works fine, most ordinary pages
- **High**: High quality MC, positive reputation, high E-E-A-T, great UX
- **Highest**: Exceptional in every way, best example of its type

---

Return ONLY a valid JSON object in this exact format with NO additional text, NO markdown, NO explanation:
{
  "criteria": [
    {"name": "Reputation", "rating": "High", "justification": "Detailed evidence-based justification referencing specific signals found on the page"},
    {"name": "Page Content", "rating": "High", "justification": "..."},
    {"name": "MC Identification", "rating": "Medium", "justification": "..."},
    {"name": "MC Focus", "rating": "High", "justification": "..."},
    {"name": "Main Content Quality", "rating": "Medium", "justification": "..."},
    {"name": "E-E-A-T", "rating": "High", "justification": "..."},
    {"name": "Overall Page Quality", "rating": "High", "justification": "..."}
  ],
  "overall": "High",
  "comment": "A comprehensive 2-3 sentence summary of the page quality assessment, referencing the most important factors that determined the rating."
}

Available ratings: Lowest, Low, Medium, High, Highest
All text must be in English.`;

    let userMsg = `Analyze the quality of this page according to Google Search Quality Rater Guidelines: ${url}\n\nActual page content fetched:\n${pageContent}`;

    if (objection && previousResult) {
      userMsg += `\n\nPrevious rating:\n${JSON.stringify(previousResult, null, 2)}\n\nUser objection: ${objection}\n\nRe-analyze taking this objection into account. If the objection provides credible new information (e.g., credentials, purpose of the site), adjust the ratings accordingly.`;
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
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg }
        ]
      })
    });

    if (!groqRes.ok) {
      const err = await groqRes.json().catch(() => ({}));
      return { statusCode: 500, body: JSON.stringify({ error: err?.error?.message || 'Groq API error' }) };
    }

    const groqData = await groqRes.json();
    const text = groqData.choices?.[0]?.message?.content || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { statusCode: 500, body: JSON.stringify({ error: 'AI did not return valid JSON' }) };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(JSON.parse(match[0]))
    };

  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
