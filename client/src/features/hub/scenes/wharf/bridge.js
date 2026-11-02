import { slab } from './shapes.js'

const STONE = [0.92, 0.86, 0.8, 1]
const IRON = [0.46, 0.43, 0.5, 1]
const TIMBER = [0.74, 0.64, 0.54, 1]
const RUST = [0.66, 0.46, 0.4, 1]

// tower bridge under construction: two gothic stone towers with a steel frame still rising, timber scaffolding, derricks,
// an approach on trestles and the first stubs of the bascule leaves. the bridge runs along z at x = bx
export function buildBridge({ world, bx = 66, nearZ = 50, towerZ = [100, 146] }) {
  const {
    bridgeStone: stone,
    bridgeWash: wash,
    bridgePlank: plank,
    bridgeSlate: slate,
  } = world.batches

  const tower = (cz) => {
    const hw = 6
    const hd = 4.4
    // stone shaft with stepped courses
    slab(stone, bx - hw, bx + hw, -3, 34, cz - hd, cz + hd, STONE)
    slab(
      stone,
      bx - hw - 0.5,
      bx + hw + 0.5,
      -3,
      3,
      cz - hd - 0.5,
      cz + hd + 0.5,
      [0.82, 0.78, 0.74, 1],
    )
    for (const y of [12, 22, 33])
      slab(
        stone,
        bx - hw - 0.3,
        bx + hw + 0.3,
        y,
        y + 0.5,
        cz - hd - 0.3,
        cz + hd + 0.3,
        [1.04, 1, 0.94, 1],
      )
    // dark gothic slits and the arched opening to the roadway
    for (const s of [-1, 1]) {
      for (let k = -2; k <= 2; k += 1) {
        for (const y of [15, 25]) {
          wash.quad(
            [
              [bx + k * 2.2 - 0.3, y, cz + s * (hd + 0.04)],
              [bx + k * 2.2 + 0.3, y, cz + s * (hd + 0.04)],
              [bx + k * 2.2 + 0.3, y + 3.4, cz + s * (hd + 0.04)],
              [bx + k * 2.2 - 0.3, y + 3.4, cz + s * (hd + 0.04)],
            ],
            { color: [0.34, 0.28, 0.34, 1], normal: [0, 0, s] },
          )
        }
      }
    }
    // corner turrets with slate spires
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = bx + sx * (hw - 0.4)
        const z = cz + sz * (hd - 0.4)
        stone.cylinder({
          c: [x, 20, z],
          r: 1.35,
          h: 40,
          seg: 10,
          color: [1.0, 0.95, 0.88, 1],
          cap: false,
        })
        slate.cylinder({
          c: [x, 44, z],
          r: 1.7,
          rTop: 0.05,
          h: 8,
          seg: 10,
          color: [0.9, 0.92, 1.05, 1],
        })
      }
    }
    // steel frame rising above the stone: columns, rings of beams, diagonal braces
    const top = 52
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        wash.bar(
          [bx + sx * (hw - 1.2), 34, cz + sz * (hd - 1.2)],
          [bx + sx * (hw - 1.2), top, cz + sz * (hd - 1.2)],
          0.45,
          { color: IRON },
        )
    for (const y of [38, 43, 48, top]) {
      for (const sz of [-1, 1])
        wash.bar(
          [bx - hw + 1.2, y, cz + sz * (hd - 1.2)],
          [bx + hw - 1.2, y, cz + sz * (hd - 1.2)],
          0.3,
          { color: IRON },
        )
      for (const sx of [-1, 1])
        wash.bar(
          [bx + sx * (hw - 1.2), y, cz - hd + 1.2],
          [bx + sx * (hw - 1.2), y, cz + hd - 1.2],
          0.3,
          { color: IRON },
        )
    }
    for (const sz of [-1, 1]) {
      wash.bar(
        [bx - hw + 1.2, 34, cz + sz * (hd - 1.2)],
        [bx + hw - 1.2, 43, cz + sz * (hd - 1.2)],
        0.2,
        { color: RUST },
      )
      wash.bar(
        [bx + hw - 1.2, 38, cz + sz * (hd - 1.2)],
        [bx - hw + 1.2, 48, cz + sz * (hd - 1.2)],
        0.2,
        { color: RUST },
      )
    }
    // timber scaffolding on the stone faces: poles, ledgers, boarded lifts
    for (const sz of [-1, 1]) {
      const z = cz + sz * (hd + 1.6)
      for (let x = bx - hw - 1.6; x <= bx + hw + 1.7; x += 2.9)
        wash.bar([x, -1.2, z], [x, 38, z], 0.12, { color: TIMBER })
      for (let y = 4; y <= 36; y += 4) {
        wash.bar([bx - hw - 1.6, y, z], [bx + hw + 1.6, y, z], 0.1, { color: TIMBER })
        if (y % 8 === 4)
          slab(plank, bx - hw - 1.6, bx + hw + 1.6, y, y + 0.1, z - 0.9, z + 0.9, TIMBER)
      }
      for (let x = bx - hw - 1.6; x < bx + hw + 1.6; x += 5.8)
        wash.bar([x, 4, z], [x + 2.9, 12, z], 0.08, { color: TIMBER })
    }
    for (const sx of [-1, 1]) {
      const x = bx + sx * (hw + 1.6)
      for (let z = cz - hd - 1.6; z <= cz + hd + 1.7; z += 2.9)
        wash.bar([x, 0, z], [x, 38, z], 0.12, { color: TIMBER })
      for (let y = 4; y <= 36; y += 4)
        wash.bar([x, y, cz - hd - 1.6], [x, y, cz + hd + 1.6], 0.1, { color: TIMBER })
    }
    // derrick on top: mast, boom, guy
    wash.bar([bx - 2.5, top, cz], [bx - 2.5, top + 14, cz], 0.35, { color: IRON })
    wash.bar([bx - 2.5, top + 13, cz], [bx + 7.5, top + 5, cz], 0.22, { color: IRON })
    wash.bar([bx + 7.5, top + 5, cz], [bx + 7.5, top - 3, cz], 0.04, {
      color: [0.78, 0.7, 0.55, 1],
    })
    slab(plank, bx + 7.1, bx + 7.9, top - 4.4, top - 3, cz - 0.4, cz + 0.4, TIMBER)
  }
  tower(towerZ[0])
  tower(towerZ[1])

  // approach on timber trestles and steel girders from the quay to the first tower
  const deckY = 9
  for (let z = nearZ; z < towerZ[0] - 5; z += 6) {
    for (const x of [bx - 4, bx + 4]) wash.bar([x, -1.2, z], [x, deckY, z], 0.34, { color: TIMBER })
    wash.bar([bx - 4.6, deckY - 0.6, z], [bx + 4.6, deckY - 0.6, z], 0.3, { color: IRON })
    wash.bar([bx - 4, 2, z], [bx + 4, 7, z], 0.14, { color: TIMBER })
  }
  for (const x of [bx - 4.2, bx + 4.2])
    wash.bar([x, deckY, nearZ], [x, deckY, towerZ[0] - hwStone()], 0.5, { color: IRON })
  slab(plank, bx - 4.2, bx + 4.2, deckY, deckY + 0.2, nearZ, towerZ[0] - 8, [0.8, 0.66, 0.5, 1])
  // bascule stubs reaching from both towers toward the middle, and a high-level walkway girder from the first tower
  for (const s of [-1, 1]) {
    const x = bx + s * 4.2
    wash.bar([x, deckY, towerZ[0] + hwStone()], [x, deckY + 1.6, towerZ[0] + 14], 0.55, {
      color: IRON,
    })
    wash.bar([x, deckY, towerZ[1] - hwStone()], [x, deckY + 1.2, towerZ[1] - 11], 0.55, {
      color: IRON,
    })
    wash.bar([x, 36, towerZ[0] + hwStone()], [x, 36.5, towerZ[0] + 18], 0.4, { color: IRON })
  }
  for (let z = towerZ[0] + 6; z < towerZ[0] + 18; z += 4)
    wash.bar([bx - 4.2, 36.2, z], [bx + 4.2, 36.2, z], 0.25, { color: IRON })
  // a moored work barge with a pile driver under the first span
  slab(plank, bx - 3, bx + 3, -1.2, -0.3, towerZ[0] - 22, towerZ[0] - 12, TIMBER)
  wash.bar([bx, -0.3, towerZ[0] - 17], [bx, 8, towerZ[0] - 17], 0.3, { color: IRON })
  return { center: [bx, towerZ[0], towerZ[1]] }
}

const hwStone = () => 4.4
