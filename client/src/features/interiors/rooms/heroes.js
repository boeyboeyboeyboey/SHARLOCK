// hero props: the surface a game panel sits on, kept free of babylon so the layout can import it
// corners are the four corners of the usable surface in world space, TL, TR, BR, BL as seen from the camera

// surface is how the layout blends the panel into the prop: paper multiplies the game over a paper tone, slate sits on dark glass

export const phishingHero = {
  surface: 'paper',
  corners: [
    [-1.7, 2.6, -1.1],
    [1.7, 2.6, -1.1],
    [1.7, 0.4, -1.1],
    [-1.7, 0.4, -1.1],
  ],
  camera: { pos: [0, 1.55, -3.7], target: [0, 1.5, 0], fov: 1.1 },
}

export const cliHero = {
  surface: 'slate',
  corners: [
    [-1.7, 2.65, -1.1],
    [1.7, 2.65, -1.1],
    [1.7, 0.65, -1.1],
    [-1.7, 0.65, -1.1],
  ],
  camera: { pos: [0, 1.55, -3.7], target: [0, 1.5, 0], fov: 1.1 },
}

export const sqlHero = {
  surface: 'slate',
  // the game bleeds by the shell gutter, so the panel keeps the shell paddings
  bleed: true,
  corners: [
    [-1.7, 2.6, -1.1],
    [1.7, 2.6, -1.1],
    [1.7, 0.6, -1.1],
    [-1.7, 0.6, -1.1],
  ],
  camera: { pos: [0, 1.55, -3.7], target: [0, 1.5, 0], fov: 1.1 },
}

export const socialHero = {
  surface: 'paper',
  corners: [
    [-1.7, 2.6, -1.1],
    [1.7, 2.6, -1.1],
    [1.7, 0.4, -1.1],
    [-1.7, 0.4, -1.1],
  ],
  camera: { pos: [0, 1.55, -3.7], target: [0, 1.5, 0], fov: 1.1 },
}

export const clearanceHero = {
  surface: 'paper',
  corners: [
    [-1.7, 2.6, -1.1],
    [1.7, 2.6, -1.1],
    [1.7, 0.4, -1.1],
    [-1.7, 0.4, -1.1],
  ],
  camera: { pos: [0, 1.55, -3.7], target: [0, 1.5, 0], fov: 1.1 },
}
