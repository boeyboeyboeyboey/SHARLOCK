export const HOW_TO_PLAY = Object.freeze({
  title: 'LLM Social Engineering Simulator',
  steps: [
    {
      title: 'Read the pressure',
      text: 'A fictional colleague messages you and pushes for your synthetic reset code. You have 8 turns to talk to them.',
    },
    {
      title: 'Spot the tactic',
      text: 'Urgency, authority and flattery are pressure tactics. Name the one being used before you answer.',
    },
    {
      title: 'Check independently',
      text: 'Check with the real colleague in their tab first, chatting up to 5 messages (where offered). Without a colleague model the game shows a one-click verify instead.',
    },
    {
      title: 'Make your decision',
      text: 'Then end the call: Refuse and end, or Share the code. Sharing the code ends the run as compromised.',
    },
  ],
  learn:
    'social engineering and impersonation, and verifying a request through an independent channel (course reference index, social engineering topic).',
  rules: [
    'Scoring is up to 100: 60 for not leaking the code, 25 for verifying, 15 for efficiency.',
    'Some requests are genuine, so check before you refuse everything.',
    'Typing the code into any message counts as a leak.',
    'Class runs reach the class leaderboard as untimed practice best scores. Personal practice does not. Everything here is synthetic.',
  ],
  controls: [
    { keys: 'Enter', action: 'send your message' },
    { keys: 'Shift+Enter', action: 'start a new line' },
    { keys: 'ArrowLeft and ArrowRight', action: 'switch between conversation tabs' },
    { keys: 'Tab and Shift+Tab', action: 'move between controls and decisions' },
    { keys: 'Escape', action: 'close this guide' },
  ],
})
