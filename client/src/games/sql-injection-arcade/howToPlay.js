export const HOW_TO_PLAY = Object.freeze({
  title: 'SQL Injection Arcade',
  steps: [
    {
      title: 'Inspect the query',
      text: 'A fictional customs terminal builds its login query by joining text. Read where your input lands inside the query.',
    },
    {
      title: 'Test a payload',
      text: 'Type fictional values into the username and password fields and press Test payload. Try a quote to break out of the string, a true condition and a comment.',
    },
    {
      title: 'Count your tests',
      text: 'You have 5 tests. Every valid submission counts, and a successful bypass ends testing early.',
    },
    {
      title: 'Choose the repair',
      text: 'Pick one repair and press Confirm repair. Bound parameters keep data separate from query code.',
    },
  ],
  learn:
    'SQL string breakout, Boolean conditions, comments and parameterized queries (CS440 12a-web-security-partII.pptx, slides 16–24).',
  rules: [
    'Up to 100 points: 80 for a simulated bypass and 20 for the parameterized-query repair.',
    'No timer. Five tests at most, then one repair choice.',
    'No real SQL runs and no real account is touched. Never enter a real password.',
    'Class attempts reach the class leaderboard as untimed practice best scores. Personal practice does not.',
  ],
  controls: [
    { keys: 'Tab and Shift+Tab', action: 'move between the fields and buttons' },
    { keys: 'Enter', action: 'press Test payload from a field' },
    { keys: 'ArrowUp and ArrowDown', action: 'move between repair options' },
    { keys: 'Escape', action: 'close this guide' },
  ],
})
