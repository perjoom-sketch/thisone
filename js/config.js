/**
 * ThisOne Intelligent Engine Configuration
 * DO NOT CHANGE THE MODEL NAME UNLESS EXPLICITLY INSTRUCTED.
 */
const AI_CONFIG = {
  MODEL_NAME: 'gemini-2.0-flash',
  ANALYSIS_VERSION: 'v2.0',
  DEFAULT_RESULT_COUNT: 5
};

if (typeof window !== 'undefined') {
  window.ThisOneConfig = AI_CONFIG;
}
if (typeof module !== 'undefined') {
  module.exports = AI_CONFIG;
}
