/**
 * Stores the current user message so tools can access the original,
 * unmodified text regardless of what the AgentLoop LLM passes as arguments.
 *
 * Safe for single-user bots. For multi-user, key by userId instead.
 */
let _userText = '';

export const ExecutionContext = {
  setUserText(text: string): void {
    _userText = text;
  },

  getUserText(): string {
    return _userText;
  },
};
