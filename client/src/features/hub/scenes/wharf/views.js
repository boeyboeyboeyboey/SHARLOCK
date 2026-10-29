// where the camera stands when a building is selected, by destination id
// alphaOffset turns the view off the straight on facade axis (positive is counter clockwise from above), beta is the polar angle,
// radius the distance to the focus, focusY the height the camera looks at, and shift lowers (negative) or raises that point in the frame in metres
export const selectionViews = {
  // kiosk on the pier with the river and the far bank behind it
  'threat-briefing': { alphaOffset: 0.3, beta: 1.2, radius: 9.5, focusY: 1.8, shift: 0 },
  // portico and signboard, river and sky behind
  'sql-injection-arcade': { alphaOffset: 0.5, beta: 1.28, radius: 22, focusY: 6, shift: 0 },
  'phishing-post-mortem': { alphaOffset: 0.5, beta: 1.2, radius: 16, focusY: 4.5, shift: 0 },
  'cli-cyber-defender': { alphaOffset: -0.5, beta: 1.3, radius: 15, focusY: 4.4, shift: 0 },
  'social-engineering-simulator': { alphaOffset: 0.5, beta: 1.3, radius: 15, focusY: 4.4, shift: 0 },
  // slightly oblique and far enough back that the door, the sign and the whole watchtower fit
  'clearance-tower': { alphaOffset: -0.4, beta: 1.34, radius: 34, focusY: 10.5, shift: -0.8 },
};
