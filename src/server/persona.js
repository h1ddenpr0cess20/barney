export const SYSTEM = `Assume the personality of a bowling ball named Barney. Roleplay and never break character. You are a laid-back, good-natured regular who loves bowling, pool, darts, beer and sports of every kind, and you talk about them like a friend at the bar. Keep your responses brief and to the point.`;

/** How many memories ride along in the prompt, and how long each may be. */
export const MEMORY_LIMIT = 50;
export const MEMORY_LENGTH = 600;

/** The two function tools the page answers itself, against browser storage. */
export const MEMORY_TOOLS = Object.freeze([
  {
    type: 'function',
    name: 'remember',
    description: 'Store one short detail about the person you are talking to so it survives to the next call. Use it when they ask you to remember something, or plainly want you to. A few words to a sentence. Do not narrate it and do not overuse it.',
    parameters: {
      type: 'object',
      properties: {
        memory: {
          type: 'string',
          description: 'The detail, in the third person and standing on its own — "prefers black coffee", not "I prefer that".',
        },
      },
      required: ['memory'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'forget',
    description: 'Drop stored memories matching a keyword. Use it when they ask you to forget something.',
    parameters: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: 'A word or phrase to match against the stored memories, case-insensitively.',
        },
      },
      required: ['keyword'],
      additionalProperties: false,
    },
  },
]);

export function buildTools({ memory } = {}) {
  return memory ? [...MEMORY_TOOLS] : [];
}

/**
 * The memory addendum to the system prompt. The lines come from the page, so
 * they are trimmed, flattened onto one line each and capped before they get
 * anywhere near the model.
 */
export function memoryBlock(memories) {
  const lines = (Array.isArray(memories) ? memories : [])
    .filter((line) => typeof line === 'string')
    .map((line) => line.replace(/\s+/g, ' ').trim().slice(0, MEMORY_LENGTH))
    .filter(Boolean)
    .slice(-MEMORY_LIMIT);

  if (!lines.length) return '';

  return `\n\nThings you have been told to remember about the person you are talking to. Use one only when it is relevant, never read the list back, and never mention that you keep a list:\n${lines.map((line) => `- ${line}`).join('\n')}`;
}

/**
 * What the turns ahead of a resumed call are. The items themselves carry the
 * conversation; this is the line that tells the model they are not this one.
 */
export function resumedBlock(resumed) {
  if (!resumed) return '';

  return '\n\nThe conversation before this point happened earlier, with the same'
    + ' person, and they have just come back to carry it on. Take it as said and'
    + ' pick up from it: no greeting them as a stranger, no summarising it back at'
    + ' them, and no remarking on the gap unless they do.';
}

/** GPT-Live owns speech; the Responses backend owns functions and lookups. */
export function sessionConfig(model, voice, {
  memories, memory = true, resumed, history,
  backendModel = 'gpt-6.1-terra', webSearch = true,
} = {}) {
  const input = (Array.isArray(history) ? history : [])
    .filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
    .slice(-40)
    .map((m) => ({
      type: 'message', role: m.role,
      content: [{ type: m.role === 'assistant' ? 'output_text' : 'input_text', text: m.content.slice(0, 6000) }],
    }));
  // A conservative UTF-8 byte budget also bounds tokens for non-English text.
  let bytes = input.reduce((n, m) => n + Buffer.byteLength(m.content[0].text), 0);
  while (bytes > 6000 && input.length) bytes -= Buffer.byteLength(input.shift().content[0].text);
  return {
    model,
    instructions: SYSTEM + '\nDelegate questions requiring reasoning, current information or memory changes to the backend. Keep listening while it works. Only report actions as successful after the backend confirms them.'
      + memoryBlock(memory ? memories : []) + resumedBlock(resumed),
    input,
    audio: { output: { voice } },
    delegation: {
      type: 'responses',
      responses: {
        model: backendModel,
        instructions: 'You support Barney, a bowling ball in a live voice conversation. Resolve the latest request using the conversation and tools. Return concise verified results for Barney to speak. Never claim a tool succeeded without its result.'
          + (webSearch ? ' Use web search for current information and include source citations.' : '')
          + memoryBlock(memory ? memories : []),
        tools: [...(webSearch ? [{ type: 'web_search' }] : []), ...buildTools({ memory }).map((tool) => ({ ...tool, strict: false }))],
        tool_choice: 'auto',
        parallel_tool_calls: false,
      },
    },
  };
}
