// hero props: the surface a game panel sits on, kept free of babylon so the layout can import it
// corners are the four corners of the usable surface in world space, TL, TR, BR, BL as seen from the camera

export const phishingHero = {
  corners: [
    [-1.7, 2.6, -1.1],
    [1.7, 2.6, -1.1],
    [1.7, 0.4, -1.1],
    [-1.7, 0.4, -1.1],
  ],
  camera: { pos: [0, 1.55, -3.7], target: [0, 1.5, 0], fov: 1.1 },
}
