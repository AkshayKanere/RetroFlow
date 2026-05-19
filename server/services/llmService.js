const COLUMN_LABELS = {
  well: 'What Went Well',
  didnt: "What Didn't Go Well",
  action: 'Action Items',
};

export function buildPrompt(cards, votes) {
  const parentCards = cards.filter(c => !c.group_id);
  const voteCounts = {};
  for (const v of votes) {
    voteCounts[v.card_id] = (voteCounts[v.card_id] || 0) + 1;
  }

  let prompt = 'Summarize this sprint retrospective in exactly 2 sentences.\n\n';
  for (const [col, label] of Object.entries(COLUMN_LABELS)) {
    const colCards = parentCards.filter(c => c.column === col);
    prompt += `${label}:\n`;
    if (colCards.length === 0) {
      prompt += '- (none)\n';
    } else {
      for (const card of colCards) {
        const count = voteCounts[card.id] || 0;
        prompt += `- ${card.text} (${count} votes)\n`;
      }
    }
    prompt += '\n';
  }
  return prompt;
}

export function parseSummary(responseText) {
  return responseText.trim();
}

export async function generateSummary(cards, votes) {
  const prompt = buildPrompt(cards, votes);
  const gatewayUrl = process.env.LLM_GATEWAY_URL;
  const apiKey = process.env.LLM_API_KEY;

  if (!gatewayUrl || !apiKey) {
    throw new Error('LLM_GATEWAY_URL and LLM_API_KEY environment variables are required');
  }

  const response = await fetch(gatewayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM Gateway error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || data.response || '';
  return parseSummary(text);
}
