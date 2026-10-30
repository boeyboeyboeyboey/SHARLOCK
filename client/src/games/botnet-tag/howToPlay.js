export const HOW_TO_PLAY = Object.freeze({
  title: 'Botnet Tag',
  steps: [
    {
      title: 'Stay clean',
      text: 'Run from the infected. Hold Shift to sprint for a moment.',
    },
    {
      title: 'Patch a station',
      text: 'Reach a station, press E (or tap Use) and solve its task. Patched means 15 seconds of immunity.',
    },
    {
      title: 'Spread the botnet',
      text: 'Infected? Touch a survivor to infect them. Immune players cannot be infected.',
    },
    {
      title: 'Beat the clock',
      text: 'Survivors win if anyone is still clean at 3:00. The botnet wins by infecting everyone.',
    },
  ],
  learn:
    'how worms and botnets spread and how patching and filtering stop them (CS440 software security and network security topics). Everything is a game; nothing real is touched.',
  rules: [
    'Three to eight players. Bots fill the room to three.',
    'One player starts infected. Immune players cannot be infected.',
    'A wrong answer locks the station for you for a few seconds.',
    'Your result is saved as practice. There is no leaderboard.',
  ],
  controls: [
    { keys: 'W A S D or arrows', action: 'move' },
    { keys: 'Shift', action: 'sprint' },
    { keys: 'Space', action: 'jump' },
    { keys: 'E', action: 'use a station' },
    { keys: 'Escape', action: 'close a task or this guide' },
  ],
})
