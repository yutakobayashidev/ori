type Channel = 'Slack' | 'LINE' | 'Gmail'

export type Conversation = {
  id: string
  name: string
  role: string
  subject: string
  channels: Channel[]
  replyChannel: Channel
  updatedAt: string
  deadline?: string
  summary: string
  nextStep: string
  messages: {
    id: string
    channel: Channel
    text: string
    time: string
    direction: 'in' | 'out'
  }[]
  facts: { text: string; sourceId: string }[]
  drafts: { label: string; text: string }[]
  scheduleOptions: string[]
}

// All contacts, conversations and proposed appointments are fictional UI samples.
export const conversations: Conversation[] = [
  {
    id: 'design-review',
    name: 'Haruka Aoki',
    role: 'Product designer',
    subject: 'Schedule next week’s design review',
    channels: ['Slack', 'Gmail'],
    replyChannel: 'Slack',
    updatedAt: '10:42',
    deadline: 'Sep 29, 17:00',
    summary:
      'A request to review the new screens. The materials arrived by email, and Haruka is waiting on Slack to arrange a 30-minute review.',
    nextStep: 'Review the materials and suggest a time for a 30-minute call.',
    messages: [
      {
        id: 'aoki-1',
        channel: 'Gmail',
        time: 'Sep 27, 16:20',
        direction: 'in',
        text: 'Sharing the screens for review. I would especially appreciate your thoughts on the first-time experience. The review should take about 30 minutes.',
      },
      {
        id: 'aoki-2',
        channel: 'Slack',
        time: 'Sep 28, 10:42',
        direction: 'in',
        text: 'Could we find a time next week for the review I emailed yesterday? Please send a few options by September 29 at 17:00. An afternoon would be ideal.',
      },
    ],
    facts: [
      {
        text: 'The review should take 30 minutes.',
        sourceId: 'aoki-1',
      },
      {
        text: 'An afternoon is preferred for this review.',
        sourceId: 'aoki-2',
      },
    ],
    drafts: [
      {
        label: 'Brief',
        text: 'Thanks for the materials! I will take a look. Let’s find 30 minutes one afternoon next week.',
      },
      {
        label: 'Polite',
        text: 'Thank you for sharing the materials. I will focus on the first-time experience. Would you have 30 minutes one afternoon next week?',
      },
      {
        label: 'Acknowledge',
        text: 'Thanks for getting in touch. I have the materials and will check my schedule and reply by September 29 at 17:00.',
      },
    ],
    scheduleOptions: ['Mon, Oct 5, 14:00–14:30', 'Tue, Oct 6, 15:00–15:30'],
  },
  {
    id: 'weekend-coffee',
    name: 'Naoto Mori',
    role: 'Friend',
    subject: 'Catch up over coffee',
    channels: ['LINE'],
    replyChannel: 'LINE',
    updatedAt: 'Yesterday',
    summary:
      'An invitation to meet for coffee while Naoto is nearby. There is no rush to reply.',
    nextStep:
      'Share your availability if you would like to meet. You do not need to decide right now.',
    messages: [
      {
        id: 'mori-1',
        channel: 'LINE',
        time: 'Sep 27, 19:15',
        direction: 'in',
        text: 'I might be in your area next week. Want to grab coffee if our schedules line up? Saturday afternoon works for me. No rush—let me know when you know!',
      },
    ],
    facts: [
      {
        text: 'Saturday afternoon is available this time.',
        sourceId: 'mori-1',
      },
    ],
    drafts: [
      {
        label: 'Brief',
        text: 'Sounds good, it would be great to catch up! I will check Saturday afternoon.',
      },
      {
        label: 'Polite',
        text: 'Thanks for the invitation! I would love to grab coffee. I will check my plans for Saturday afternoon and let you know.',
      },
      {
        label: 'Acknowledge',
        text: 'Thanks! I am not sure about my schedule yet, but I will let you know.',
      },
    ],
    scheduleOptions: ['Sat, Oct 3, 14:00–15:00', 'Sat, Oct 3, 16:00–17:00'],
  },
  {
    id: 'estimate-check',
    name: 'Risa Fujii',
    role: 'Project partner',
    subject: 'Confirm the scope for an estimate',
    channels: ['Gmail'],
    replyChannel: 'Gmail',
    updatedAt: '9:10',
    deadline: 'Sep 30, 12:00',
    summary:
      'Risa needs confirmation that the project covers three screens before preparing an estimate. Please reply by noon on September 30.',
    nextStep:
      'Confirm the number of screens before replying. Avoid committing before checking.',
    messages: [
      {
        id: 'fujii-1',
        channel: 'Gmail',
        time: 'Sep 28, 9:10',
        direction: 'in',
        text: 'Before preparing an estimate, could you confirm that the scope is the list, detail, and settings screens? If you can confirm by noon on September 30, I can send the estimate the same day.',
      },
    ],
    facts: [
      {
        text: 'The estimate will be prepared after the screen count is confirmed.',
        sourceId: 'fujii-1',
      },
    ],
    drafts: [
      {
        label: 'Brief',
        text: 'Thanks. I will check the three screens and reply by noon on September 30.',
      },
      {
        label: 'Polite',
        text: 'Thank you for checking. I will confirm whether the list, detail, and settings screens cover the scope and reply by noon on September 30.',
      },
      {
        label: 'Acknowledge',
        text: 'Thanks for your message. I will check the scope and get back to you.',
      },
    ],
    scheduleOptions: [],
  },
  {
    id: 'reading-note',
    name: 'Yu Tanabe',
    role: 'Study group friend',
    subject: 'The article we talked about',
    channels: ['Slack'],
    replyChannel: 'Slack',
    updatedAt: 'Friday',
    summary:
      'Yu shared an article discussed at the last study group. There are no questions or requests for a reply.',
    nextStep:
      'If you do not have time to read it, you can close this without replying.',
    messages: [
      {
        id: 'tanabe-1',
        channel: 'Slack',
        time: 'Sep 25, 18:30',
        direction: 'in',
        text: 'Found the article we discussed about getting work done with fewer tools! Read it when you have time. No reply needed.',
      },
    ],
    facts: [
      {
        text: 'This message explicitly says no reply is needed.',
        sourceId: 'tanabe-1',
      },
    ],
    drafts: [
      {
        label: 'Brief',
        text: 'Thanks for sharing! I will read it later.',
      },
      {
        label: 'Polite',
        text: 'Thanks for remembering. I have been thinking about this topic, so I will set aside some time to read it.',
      },
      {
        label: 'Acknowledge',
        text: 'Thanks, got it!',
      },
    ],
    scheduleOptions: [],
  },
]
