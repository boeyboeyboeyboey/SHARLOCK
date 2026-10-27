export const HOW_TO_PLAY = Object.freeze({
  title: 'The Phishing Post-Mortem',
  steps: [
    {
      title: 'Browse the inbox',
      text: 'Open the messages in the SHARMAIL inbox. Check each sender, reply-to address and link before you trust it.',
    },
    {
      title: 'Accuse one message',
      text: 'Several messages are hostile, but only one caused the compromise. Pick it as Patient Zero.',
    },
    {
      title: 'Back it with two clues',
      text: 'Choose exactly two clues from the evidence that prove your choice, such as a lookalike domain or a proxy log entry.',
    },
    {
      title: 'Submit the verdict',
      text: 'Submit once. The right message earns 60 points and each correct clue 20, for up to 100.',
    },
  ],
  learn:
    'tracing a credential theft through lookalike domains, reply-to mismatches and proxy logs (course reference index, phishing and web security decks).',
  rules: [
    'One case per attempt, picked by the server, with one verdict.',
    'The right email scores 60 and each correct clue 20, up to 100.',
    'Links stay inert until you inspect them. Everything here is synthetic.',
    'Class attempts reach the class leaderboard. Personal practice does not.',
  ],
  controls: [
    { keys: 'ArrowUp and ArrowDown', action: 'move between messages in the inbox' },
    { keys: 'Enter or Space', action: 'open a message or pick a clue' },
    { keys: 'Tab and Shift+Tab', action: 'move between controls' },
    { keys: 'Escape', action: 'close this guide' },
  ],
})
