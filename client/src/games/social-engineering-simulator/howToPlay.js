export const HOW_TO_PLAY = Object.freeze({
  title: 'Help Desk Shift',
  steps: [
    {
      title: 'Take the call',
      text: 'A caller wants a secret code. Chat to find out who they are.',
    },
    {
      title: 'Check the desk',
      text: 'Directory, Ticket and Call back show the records. Ask your colleague twice per call.',
    },
    {
      title: 'Decide',
      text: 'Grant, Call back, Refuse or Escalate. Some callers are genuine.',
    },
    { title: 'Read the tells', text: 'Review the red flags, then take the next of 4 calls.' },
  ],
  learn:
    'social engineering and impersonation, and verifying a request through an independent channel (course reference index, social engineering topic).',
  rules: [
    'Never type real personal details: messages may go to Google Gemini.',
    'Typing the code is a strike. Granting an attacker is a strike. 3 strikes end the shift.',
    'Checking first earns points. Ask Sharlock costs 10.',
    'Class shifts reach the class leaderboard as untimed practice best scores. Everything here is synthetic.',
  ],
  controls: [
    { keys: 'Enter', action: 'send your message' },
    { keys: 'Shift+Enter', action: 'start a new line' },
    { keys: 'Tab and Shift+Tab', action: 'move between controls' },
    { keys: 'Escape', action: 'close this guide' },
  ],
})
