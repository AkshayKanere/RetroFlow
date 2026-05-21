import { describe, it, expect } from 'vitest';
import { buildPrompt, parseSummary, buildDetailedSummaryPrompt } from '../services/llmService.js';

describe('buildPrompt', () => {
  it('builds correct prompt from cards and votes', () => {
    const cards = [
      { id: '1', column: 'well', text: 'Great teamwork', group_id: null },
      { id: '2', column: 'didnt', text: 'Too many meetings', group_id: null },
      { id: '3', column: 'action', text: 'Reduce meeting time', group_id: null },
    ];
    const votes = [
      { card_id: '1' },
      { card_id: '1' },
      { card_id: '2' },
    ];

    const prompt = buildPrompt(cards, votes);

    expect(prompt).toContain('exactly 2 sentences');
    expect(prompt).toContain('What Went Well');
    expect(prompt).toContain("What Didn't Go Well");
    expect(prompt).toContain('Action Items');
    expect(prompt).toContain('Great teamwork (2 votes)');
    expect(prompt).toContain('Too many meetings (1 votes)');
    expect(prompt).toContain('Reduce meeting time (0 votes)');
  });

  it('excludes grouped child cards', () => {
    const cards = [
      { id: '1', column: 'well', text: 'Parent card', group_id: null },
      { id: '2', column: 'well', text: 'Child card', group_id: '1' },
    ];
    const votes = [];

    const prompt = buildPrompt(cards, votes);

    expect(prompt).toContain('Parent card');
    expect(prompt).not.toContain('Child card');
  });

  it('shows (none) for empty columns', () => {
    const cards = [];
    const votes = [];

    const prompt = buildPrompt(cards, votes);

    expect(prompt).toContain('What Went Well:\n- (none)');
    expect(prompt).toContain("What Didn't Go Well:\n- (none)");
    expect(prompt).toContain('Action Items:\n- (none)');
  });

  it('includes participant count and names', () => {
    const cards = [{ id: '1', column: 'well', text: 'Good', group_id: null }];
    const votes = [];
    const participants = [
      { id: 'p1', display_name: 'Alice' },
      { id: 'p2', display_name: 'Bob' },
      { id: 'p3', display_name: 'Charlie' },
    ];

    const prompt = buildPrompt(cards, votes, participants);

    expect(prompt).toContain('Participants (3)');
    expect(prompt).toContain('Alice');
    expect(prompt).toContain('Bob');
    expect(prompt).toContain('Charlie');
  });

  it('sorts cards by vote count (highest first) in prompt', () => {
    const cards = [
      { id: '1', column: 'well', text: 'Low votes', group_id: null },
      { id: '2', column: 'well', text: 'High votes', group_id: null },
      { id: '3', column: 'well', text: 'Medium votes', group_id: null },
    ];
    const votes = [
      { card_id: '2' }, { card_id: '2' }, { card_id: '2' },
      { card_id: '3' }, { card_id: '3' },
      { card_id: '1' },
    ];

    const prompt = buildPrompt(cards, votes);

    const highIdx = prompt.indexOf('High votes (3 votes)');
    const medIdx = prompt.indexOf('Medium votes (2 votes)');
    const lowIdx = prompt.indexOf('Low votes (1 votes)');
    expect(highIdx).toBeLessThan(medIdx);
    expect(medIdx).toBeLessThan(lowIdx);
  });
});

describe('parseSummary', () => {
  it('trims whitespace from response text', () => {
    expect(parseSummary('  hello world  ')).toBe('hello world');
    expect(parseSummary('\n\nsome summary\n\n')).toBe('some summary');
  });
});

describe('buildDetailedSummaryPrompt', () => {
  it('builds a detailed analysis prompt', () => {
    const cards = [
      { id: '1', column: 'well', text: 'Great teamwork', group_id: null },
      { id: '2', column: 'didnt', text: 'Too many meetings', group_id: null },
      { id: '3', column: 'action', text: 'Reduce meeting time', group_id: null },
    ];
    const votes = [{ card_id: '1' }, { card_id: '1' }, { card_id: '2' }];
    const title = 'Sprint 42 Retro';

    const prompt = buildDetailedSummaryPrompt(cards, votes, title);

    expect(prompt).toContain('Sprint 42 Retro');
    expect(prompt).toContain('Overview');
    expect(prompt).toContain('Key Themes');
    expect(prompt).toContain('Action Items');
    expect(prompt).toContain('Great teamwork (2 votes)');
  });

  it('includes participant count and names in detailed prompt', () => {
    const cards = [{ id: '1', column: 'well', text: 'Good', group_id: null }];
    const votes = [];
    const title = 'Test Retro';
    const participants = [
      { id: 'p1', display_name: 'Alice' },
      { id: 'p2', display_name: 'Bob' },
    ];

    const prompt = buildDetailedSummaryPrompt(cards, votes, title, participants);

    expect(prompt).toContain('Participants (2)');
    expect(prompt).toContain('Alice');
    expect(prompt).toContain('Bob');
    expect(prompt).toContain('Mention the number of participants');
  });

  it('sorts cards by vote count in detailed prompt', () => {
    const cards = [
      { id: '1', column: 'well', text: 'Low card', group_id: null },
      { id: '2', column: 'well', text: 'Top card', group_id: null },
    ];
    const votes = [{ card_id: '2' }, { card_id: '2' }, { card_id: '1' }];

    const prompt = buildDetailedSummaryPrompt(cards, votes, 'Test');

    const topIdx = prompt.indexOf('Top card (2 votes)');
    const lowIdx = prompt.indexOf('Low card (1 votes)');
    expect(topIdx).toBeLessThan(lowIdx);
  });
});
