export type Article = {
  id: string;
  title: string;
  summary: string;
  source: string;
  author: string;
  date: string;
  paragraphs: string[];
};

// All articles are original mock content. Editorial names are fictional.
export const articles: Article[] = [
  {
    id: "agent-browser-workflow",
    title: "Thinking in the browser: a new workflow with AI agents",
    summary:
      "Make implementation and verification one task: open the screen, use it, and check the result.",
    source: "Field Notes",
    author: "Field Notes Editors",
    date: "09:40",
    paragraphs: [
      "Correct code and a usable interface are different things. Is a button off screen? Does a draft survive navigation? Opening the browser is how we find out.",
      "When requesting a change, include the user journey: select an article, read it, and return to the list. Completion becomes an observed behavior rather than a modified file.",
      "Check both a typical screen width and a narrow one. Record what you tried and what you could not verify, so the next change has a clear starting point.",
      "People decide whether an experience serves its purpose. Letting an agent repeat interactions leaves more time for wording, spacing, and information order.",
    ],
  },
  {
    id: "small-cli-tools",
    title: "A good CLI considers its final line",
    summary: "Help, errors, and results: the smallest output details shape a tool’s experience.",
    source: "Toolbox Letter",
    author: "Toolbox Letter Editors",
    date: "09:15",
    paragraphs: [
      "A command can succeed without making clear what happened. Showing the output path or number of processed items helps people understand the result.",
      "Keep the cause of an error close to the next useful action. “Choose an existing directory” is more helpful than “Invalid configuration.”",
      "Human-readable output and machine-readable output serve different purposes. Offer concise text by default and a structured format when needed.",
    ],
  },
  {
    id: "three-column-reading",
    title: "Three columns create a rhythm for reading",
    summary: "Choose a place, scan the options, and settle into an article.",
    source: "Quiet Interface",
    author: "Quiet Interface Editors",
    date: "08:50",
    paragraphs: [
      "We do not read every article at the same depth. We choose a subject, scan headlines, and focus on the pieces that interest us. Three columns can give each activity its own space.",
      "Navigation on the left, options in the middle, and content on the right help preserve context. A quiet selection state and a stable scroll position make returning easy.",
      "Columns do not need equal widths. Give the list enough room for headlines, then use the remaining space for a comfortably sized reading pane.",
      "On narrow screens, present these roles in sequence. A clear way back matters more than keeping every column visible.",
    ],
  },
  {
    id: "agent-context",
    title: "Context for an agent can be brief",
    summary: "Align on the goal, constraints, and completion criteria before adding background.",
    source: "Field Notes",
    author: "Field Notes Editors",
    date: "08:30",
    paragraphs: [
      "Long requests can mix context, preferences, and requirements. Whether the recipient is a person or an agent, the first question is what the work should achieve.",
      "Start with a one-sentence goal, then add the constraints that must hold. Finally, decide what to check before calling the work complete. Reference files and screenshots can support these three points.",
      "When a decision changes, a short rewrite of the current direction can be more useful than appending more explanation. Make the active decisions easy to find.",
    ],
  },
  {
    id: "local-first-notes",
    title: "A small, local workspace for collecting information",
    summary: "Finding something again matters more than collecting it.",
    source: "Workbench Journal",
    author: "Workbench Journal Editors",
    date: "Yesterday",
    paragraphs: [
      "Bookmarks, notes, and messages to yourself can scatter saved articles across many places. Convenient capture does not guarantee convenient retrieval.",
      "Start by saving the title, source, and one sentence explaining why it matters. That sentence provides useful context when you find the article again.",
      "Local files work well with familiar search tools and editors. If you use multiple devices, decide how to handle synchronization and conflicts before adding more tools.",
    ],
  },
  {
    id: "quiet-design-system",
    title: "Build a design system in the user’s language",
    summary: "Consistency extends beyond components to labels and empty states.",
    source: "Quiet Interface",
    author: "Quiet Interface Editors",
    date: "Yesterday",
    paragraphs: [
      "Matching colors and corners do not prevent confusion if every screen names the same action differently. Words need shared rules too.",
      "Start with the names of common actions and states. Agreeing on terms like unread, saved, and loading reduces decisions when building new screens.",
      "An empty list should explain why it is empty and what can happen next. A useful sentence and action are often enough.",
    ],
  },
  {
    id: "personal-feed",
    title: "A personal feed with understandable recommendations",
    summary: "Explain why an article connects to someone’s interests.",
    source: "Field Notes",
    author: "Field Notes Editors",
    date: "Yesterday",
    paragraphs: [
      "Recommendations are easier to understand when their reasons are visible. A short explanation can show how an article relates to previous activity.",
      "The reason does not need to be a complex score. It should accurately describe the information used, such as a connection to something previously read.",
      "Interests change. A useful feed learns from activity and provides a way to correct irrelevant recommendations.",
    ],
  },
  {
    id: "behavior-tests",
    title: "Test the promises made to users",
    summary: "Describe behavior that should survive changes to the implementation.",
    source: "Toolbox Letter",
    author: "Toolbox Letter Editors",
    date: "2 days ago",
    paragraphs: [
      "If splitting a component breaks many tests, consider whether those tests depend too much on internal structure. The promise is an observable result.",
      "For an article list, test selecting a topic or finding a saved article. Using the visible names of controls makes the behavior being checked easier to understand.",
      "Not everything needs a browser test. Check complex calculations in small tests and representative journeys in the interface. Match the scope to the change.",
    ],
  },
  {
    id: "reading-typography",
    title: "Readable text is about more than font size",
    summary: "Line length, line spacing, and paragraph spacing all affect reading.",
    source: "Quiet Interface",
    author: "Quiet Interface Editors",
    date: "2 days ago",
    paragraphs: [
      "Even large text is difficult to follow when lines are too long. Very narrow lines can also interrupt the rhythm. Consider width together with font size.",
      "Line spacing helps readers follow individual lines, while paragraph spacing separates ideas. Their different roles should remain clear.",
      "Use long headlines and several paragraphs when checking a layout. Reading for a few minutes reveals fatigue and confusion that a quick glance can miss.",
    ],
  },
];
