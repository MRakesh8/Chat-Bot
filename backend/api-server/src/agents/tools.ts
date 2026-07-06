export const actionToolSchema = {
  name: "execute_dom_action",
  description: "Executes an action on the website DOM to achieve the user's intent.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["click", "type", "navigate", "idle"],
        description: "The type of action to perform."
      },
      targetSelector: {
        type: "string",
        description: "The CSS selector or XPath of the target element."
      },
      value: {
        type: "string",
        description: "The value to type if the action is 'type'."
      },
      reasoning: {
        type: "string",
        description: "Explanation of why this action was chosen."
      }
    },
    required: ["action", "reasoning"]
  }
};
