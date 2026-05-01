exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const { url, objection, previousResult } = JSON.parse(event.body || '{}');
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'ANTHROPIC_API_KEY not found in Environment Variables'
        })
      };
    }

    if (!url || !url.startsWith('http')) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Valid URL is required' })
      };
    }

    // Step 1: Fetch page content via Jina Reader
    let pageContent = '';
    try {
      const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
        headers: {
          Accept: 'text/plain',
          'X-Timeout': '10'
        }
      });

      if (jinaRes.ok) {
        const text = await jinaRes.text();
        pageContent = text.substring(0, 8000);
      }
    } catch (e) {
      pageContent = 'Could not fetch page content';
    }

    const SYSTEM_PROMPT = `You are a trained Google Search Quality Rater. Your task is to evaluate web pages strictly according to the official Google Search Quality Rater Guidelines.

Return ONLY a valid JSON object in this exact format with NO additional text, NO markdown, NO explanation:
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
  "comment": "A comprehensive 2-3 sentence summary of the page quality assessment."
}

Rating scale:
Lowest, Low, Medium, High, Highest

Evaluate:
1. Reputation
2. Page Content and purpose
3. Main Content identification
4. Main Content focus
5. Main Content quality
6. E-E-A-T
7. Overall Page Quality

Important rules:
- Harmful, deceptive, spammy, or untrustworthy pages should be Lowest.
- YMYL pages require stronger trust and expertise.
- Medium is normal for ordinary pages that are acceptable but not exceptional.
- High or Highest requires strong evidence of quality, trust, and helpfulness.

All text must be in English.`;

    let userMsg = `Analyze the quality of this page according to Google Search Quality Rater Guidelines: ${url}

Actual page content fetched:
${pageContent}`;

    if (objection && previousResult) {
      userMsg += `

Previous rating:
${JSON.stringify(previousResult, null, 2)}

User objection:
${objection}

Re-analyze taking this objection into account. If the objection provides credible new information, adjust the ratings accordingly.`;
    }

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        temperature: 0.2,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: userMsg
          }
        ]
      })
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.json().catch(() => ({}));
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: err?.error?.message || 'Claude API error'
        })
      };
    }

    const claudeData = await claudeRes.json();

    const text = (claudeData.content || [])
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    const match = text.match(/\{[\s\S]*\}/);

    if (!match) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'AI did not return valid JSON'
        })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(JSON.parse(match[0]))
    };

  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: e.message
      })
    };
  }
};
