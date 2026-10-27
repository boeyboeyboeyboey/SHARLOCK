export const HOW_TO_PLAY = Object.freeze({
  title: 'Clearance Tower',
  steps: [
    {
      title: 'Read the dossier',
      text: 'Pick a case. The dossier names the agents, the files and the access control model you must use.',
    },
    {
      title: 'Set the policy',
      text: 'Grant read and write rights in the matrix, set file labels, or design roles. Give each agent only what the work needs.',
    },
    {
      title: 'Predict, then run the day',
      text: 'Call a few requests allowed or denied, then watch the day play out. Real work should succeed and every leak should be blocked.',
    },
    {
      title: 'Score the case',
      text: 'Each case earns up to 100 points and 1 to 3 stars. Finish climb saves your total.',
    },
  ],
  learn:
    'discretionary, mandatory (Bell–LaPadula) and role-based access control, including Trojan horses and separation of duties (CS440 07-access-control, slides 13–32).',
  rules: [
    'Six cases, played in any order. Each case can be run once.',
    'A case scores up to 100 for leaks stopped, work completed, least privilege and predictions.',
    'A climb totals up to 600 points. Cases you skip score 0.',
    'There is no timer. Class climbs reach that class leaderboard; personal climbs do not.',
  ],
  controls: [
    { keys: 'Tab and Shift+Tab', action: 'move between controls' },
    { keys: 'Enter or Space', action: 'grant or remove a right, pick an option, press a button' },
    { keys: 'Play, Next event, Skip to end', action: 'step through the day once it runs' },
    { keys: 'Escape', action: 'close this guide' },
  ],
})
