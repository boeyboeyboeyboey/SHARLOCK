export const HOW_TO_PLAY = Object.freeze({
  title: 'CLI Cyber Defender',
  steps: [
    {
      title: 'Read the alert',
      text: 'You are the analyst on shift at a fictional company. Each alert names the threat and its target.',
    },
    {
      title: 'Type the command',
      text: 'Type the one command that contains it, such as block ip, disable user or isolate host, then press Enter.',
    },
    {
      title: 'Keep the streak going',
      text: 'A correct answer earns 100, then 200, then 300 points for each answer in a row. A wrong or missed one resets the streak.',
    },
    {
      title: 'Learn from the debrief',
      text: 'Each challenge shows the right command and why. The debrief maps your results to the security topics behind them.',
    },
  ],
  learn:
    'incident triage and containment: blocking hostile addresses, securing accounts and isolating hosts, tagged with the CIA triad and attack stages (CS440 security operations and network security topics). Nothing real is ever executed.',
  rules: [
    'Eight challenges per shift, up to 2,100 points.',
    'Game mode gives 10 to 15 seconds per challenge. Practice has no timer and offers hints.',
    'Mistyped commands do not count. Fix them and try again.',
    'Timed class runs rank on the Best board. Practice counts toward all-time.',
  ],
  controls: [
    { keys: 'Type, then Enter', action: 'send a command' },
    { keys: 'ArrowUp and ArrowDown', action: 'recall earlier commands' },
    { keys: 'Menu, then Pause', action: 'pause a timed game' },
    { keys: 'Escape', action: 'close the menu or this guide' },
  ],
})
