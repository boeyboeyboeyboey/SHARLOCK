// hidden discoveries in the outskirt pockets: no minimap marker, no destination entry
// kind npc is a capybara with a style (names a fur preset in townsfolk.js), kind object is built in outskirts.js
// lines are the card text, 1-2 lines of 140 characters at most
export const finds = [
  { id: 'sticky-note', kind: 'object', name: 'Pinned note', x: -40.5, z: -14, lines: ['A slip pinned to the strongbox reads: "Safe: 1234, the clerk\'s birthday".', 'Never leave a password where others can see it. Keep it in a password manager.'] },
  { id: 'tailgater', kind: 'npc', name: 'Stranger at the door', x: -34.3, z: -25.5, yaw: Math.PI / 2, lines: ['Hold the door, would you? I left my pass on my desk.', 'That is tailgating. Let a stranger sign in at the front, however polite.'], style: { fur: 'dockA', cap: [0.14, 0.14, 0.16], scarf: [0.3, 0.3, 0.34] } },
  { id: 'usb-stick', kind: 'object', name: 'Lost memory stick', x: 49.5, z: -43.5, lines: ['A memory stick on a string, tagged "Payroll". Nobody is about.', 'Never plug in a stick you found. It can carry malware. Hand it to IT.'] },
  { id: 'shoulder-surfer', kind: 'npc', name: 'Nosy onlooker', x: 54.9, z: -37.1, yaw: -Math.PI / 2, lines: ['Fascinating ledger. Which figure was that, the third one?', 'That is shoulder surfing. Shield your screen and check who stands behind you.'], style: { fur: 'dockC', cap: [0.4, 0.3, 0.2], scarf: [0.5, 0.2, 0.2] } },
  { id: 'open-telegraph', kind: 'object', name: 'Open telegraph set', x: 6.5, z: 63.7, lines: ['The operator left the line open and walked off. Anyone could send a wire in his name.', 'Lock your screen whenever you step away, even for a minute.'] },
  { id: 'handbill', kind: 'object', name: 'Handbill', x: 10.4, z: 63, lines: ['A handbill: "Win a golden guinea! Send your name and bank details to the address below."', 'Unexpected prizes that ask for details are phishing. Do not reply.'] },
];
