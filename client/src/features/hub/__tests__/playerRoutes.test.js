import { describe, expect, it } from 'vitest'
import { canvasPoint, pathGraph, planRoute } from '../scenes/shared/player.js'

const open = () => true

describe('click to walk', () => {
  it('hands the picker css pixels whatever the render size', () => {
    const rect = { left: 10, top: 20, width: 800, height: 600 }
    expect(canvasPoint({ clientX: 110, clientY: 220 }, rect)).toEqual({ x: 100, y: 200 })
  })
})

describe('route planning', () => {
  const lanes = [
    [
      [0, 0],
      [10, 0],
      [20, 0],
    ],
    [
      [10, 0],
      [10, 10],
    ],
    [
      [0, 0],
      [0, 30],
      [20, 30],
      [20, 0],
    ],
  ]

  it('joins lanes at their shared points', () => {
    const graph = pathGraph(lanes)
    expect(graph.nodes).toHaveLength(6)
  })

  it('takes the shortest lane and ends at the door itself', () => {
    const route = planRoute(pathGraph(lanes), { x: 0.2, z: 0 }, { x: 20, z: 1 }, open)
    expect(route).toEqual([
      [0, 0],
      [10, 0],
      [20, 0],
      [20, 1],
    ])
  })

  it('goes straight to the door when start and goal share a node', () => {
    const route = planRoute(pathGraph(lanes), { x: 10, z: 1 }, { x: 10, z: 2 }, open)
    expect(route).toEqual([
      [10, 0],
      [10, 2],
    ])
  })

  it('never starts or ends on a lane point inside a prop', () => {
    const inProp = (x, z) => !(x === 0 && z === 0)
    const route = planRoute(pathGraph(lanes), { x: 0, z: 0 }, { x: 20, z: 0 }, inProp)
    expect(route[0]).not.toEqual([0, 0])
  })

  it('stops at the door alone when the goal cannot be reached along a lane', () => {
    const graph = pathGraph([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [50, 50],
        [51, 50],
      ],
    ])
    const route = planRoute(graph, { x: 0, z: 0 }, { x: 51, z: 51 }, open)
    expect(route.at(-1)).toEqual([51, 51])
    expect(route).toContainEqual([51, 50])
  })
})
