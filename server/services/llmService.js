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

  const model = process.env.LLM_MODEL || 'quick-thinking';
  const response = await fetch(gatewayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'user-agent': 'KGPT-CLI/1.7.0',
      'x-continue-unique-id': '9152ffa0-1fc3-421b-9b2a-183c0cc27672',
      'x-user-email': 'akshay.kanere@kpit.com',
    },
    body: JSON.stringify({
      model,
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

export function buildDetailedSummaryPrompt(cards, votes, title) {
  const parentCards = cards.filter(c => !c.group_id);
  const voteCounts = {};
  for (const v of votes) {
    voteCounts[v.card_id] = (voteCounts[v.card_id] || 0) + 1;
  }

  let cardSection = '';
  for (const [col, label] of Object.entries(COLUMN_LABELS)) {
    const colCards = parentCards.filter(c => c.column === col);
    cardSection += label + ':\n';
    if (colCards.length === 0) {
      cardSection += '- (none)\n';
    } else {
      for (const card of colCards) {
        const count = voteCounts[card.id] || 0;
        cardSection += '- ' + card.text + ' (' + count + ' votes)\n';
      }
    }
    cardSection += '\n';
  }

  return 'You are analyzing a sprint retrospective titled "' + title + '".\n\n' +
    'Here are all the cards from the retrospective:\n\n' +
    cardSection +
    'Generate a detailed markdown analysis with the following sections:\n' +
    '## Overview\nBrief description of what this retro covered.\n\n' +
    '## Key Themes\nIdentify patterns and recurring themes across all cards.\n\n' +
    '## Top Voted Items\nHighlight the highest-voted cards and explain their significance.\n\n' +
    '## Action Items\nList action items from the action column, prioritized by vote count.\n\n' +
    '## Trends & Observations\nCross-cutting insights and observations.\n\n' +
    '## Recommendations\nSuggested next steps based on the retrospective data.\n';
}
