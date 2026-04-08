/**
 * Conversation-related tools for managing chat state.
 */

const terminateConversation = {
  definition: {
    type: "function",
    function: {
      name: "terminate_conversation",
      description: "Call this when the user is finished or says goodbye.",
      parameters: { type: "object", properties: {} }
    }
  },

  /**
   * Note: The standard handler for this is often handled in the LLM loop logic
   * by yielding a special 'terminate' flag. We include it here for consistency.
   */
  async handler() {
    return { status: "terminating" };
  }
};

module.exports = {
  terminate_conversation: terminateConversation
};
