export const HOW_TO_PLAY = Object.freeze({
  title: 'CLI Cyber Defender',
  steps: [
    {
      title: 'Investigate first',
      text: 'You are the analyst on shift at a fictional company. An alert describes the behaviour and lists suspects but never says which one is guilty. Run logs <host> or whois <ip> to find out.',
    },
    {
      title: 'Then act',
      text: 'Type the command that contains it: block ip, disable user or isolate host. Some alerts are false alarms: type dismiss. Some incidents need two actions, in order.',
    },
    {
      title: 'Keep the streak going',
      text: 'Each correct action earns 100, then 200, then 300 points in a row. A wrong or missed one resets the streak, and in a timed game a wrong action costs 5 seconds.',
    },
    {
      title: 'Learn from the debrief',
      text: 'Each challenge shows the right command and why. The debrief maps your results to the security topics behind them.',
    },
  ],
  learn:
    'incident triage and containment: blocking hostile addresses, securing accounts and isolating hosts, tagged with the CIA triad and attack stages (CS440 security operations and network security topics). Nothing real is ever executed.',
  rules: [
    'Eight challenges per shift, up to 2,700 points.',
    'Game mode gives 20 to 30 seconds per challenge. Practice has no timer and its hints name a lookup to run.',
    'You get 6 lookups per challenge. They never score and never break your streak, but the clock keeps running.',
    'Mistyped commands do not count. Fix them and try again.',
    'Timed class runs rank on the Best board. Practice counts toward all-time.',
  ],
  controls: [
    { keys: 'Type, then Enter', action: 'send a command or lookup' },
    { keys: 'ArrowUp and ArrowDown', action: 'recall earlier commands' },
    { keys: 'Menu, then Pause', action: 'pause a timed game' },
    { keys: 'Escape', action: 'close the menu or this guide' },
  ],
})
