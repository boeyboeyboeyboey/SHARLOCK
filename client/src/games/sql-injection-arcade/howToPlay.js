export const HOW_TO_PLAY = Object.freeze({
  title: 'SQL Injection Arcade',
  steps: [
    {
      title: 'Read the case',
      text: 'Each case shows a fictional page and the query it builds by pasting your input into fixed text. The ‹placeholders› mark where your input lands.',
    },
    {
      title: 'Break the pattern',
      text: 'Type fictional input and submit it. There are five kinds of case: login bypass, UNION, boolean blind, second-order and a repair choice. The result explains what the query did with your input.',
    },
    {
      title: 'Mind your tries, lives and clock',
      text: 'Every case allows 3 tries, and a blind case allows 6 probes. Running out closes the case as failed. A class run adds 180 seconds and 3 lives: each failed case costs a life.',
    },
    {
      title: 'Apply the repair',
      text: 'After every fourth case, choose the fix that really separates data from code: bound parameters. In personal practice a hint nudges you but removes the first-try bonus.',
    },
  ],
  learn:
    'Quote breakout, comments, unquoted numbers, UNION, boolean blind, second-order injection and parameterized queries (CS440 12a-web-security-partII.pptx, slides 16–24).',
  rules: [
    'Class context: a ranked 180 second run with 3 lives. Personal context: untimed practice of 12 cases and 3 repairs, with hints.',
    'A case scores 10, 20 or 30 points by tier, plus 10 for solving it with no slip and no hint. A correct repair scores 10.',
    'No real SQL runs and no real account is touched. Never enter a real password.',
    'Class runs reach the class leaderboard; personal practice does not.',
  ],
  controls: [
    { keys: 'Tab and Shift+Tab', action: 'move between the fields and buttons' },
    { keys: 'Enter', action: 'submit the current field' },
    { keys: 'ArrowUp and ArrowDown', action: 'move between repair options' },
    { keys: 'Escape', action: 'close this guide' },
  ],
})
