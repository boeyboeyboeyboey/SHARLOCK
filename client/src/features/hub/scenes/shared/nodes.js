import { InputBlock } from '@babylonjs/core/Materials/Node/Blocks/Input/inputBlock.js'
import { AddBlock } from '@babylonjs/core/Materials/Node/Blocks/addBlock.js'
import { MultiplyBlock } from '@babylonjs/core/Materials/Node/Blocks/multiplyBlock.js'
import { ScaleBlock } from '@babylonjs/core/Materials/Node/Blocks/scaleBlock.js'
import { LerpBlock } from '@babylonjs/core/Materials/Node/Blocks/lerpBlock.js'
import { SmoothStepBlock } from '@babylonjs/core/Materials/Node/Blocks/smoothStepBlock.js'
import { DotBlock } from '@babylonjs/core/Materials/Node/Blocks/dotBlock.js'
import {
  TrigonometryBlock,
  TrigonometryBlockOperations,
} from '@babylonjs/core/Materials/Node/Blocks/trigonometryBlock.js'
import { NodeMaterialBlockConnectionPointTypes as T } from '@babylonjs/core/Materials/Node/Enums/nodeMaterialBlockConnectionPointTypes.js'
import { Color3 } from '@babylonjs/core/Maths/math.color.js'

// tiny helpers for building node graphs that compile to both glsl and wgsl
export const num = (name, value) => {
  const block = new InputBlock(name, undefined, T.Float)
  block.value = value
  block.isConstant = true
  return block.output
}
// float that can change every frame
export const uniform = (name, value) => {
  const block = new InputBlock(name, undefined, T.Float)
  block.value = value
  return block
}
export const color3 = (name, hex) => {
  const block = new InputBlock(name, undefined, T.Color3)
  block.value = Color3.FromHexString(hex)
  block.isConstant = true
  return block.output
}
const binary = (Block, name, a, b) => {
  const block = new Block(name)
  a.connectTo(block.left)
  b.connectTo(block.right)
  return block.output
}
export const add = (a, b) => binary(AddBlock, 'add', a, b)
export const mul = (a, b) => binary(MultiplyBlock, 'mul', a, b)
export const dot = (a, b) => binary(DotBlock, 'dot', a, b)
export const scale = (a, factor) => {
  const block = new ScaleBlock('scale')
  a.connectTo(block.input)
  factor.connectTo(block.factor)
  return block.output
}
export const trig = (op, a) => {
  const block = new TrigonometryBlock('trig')
  block.operation = op
  a.connectTo(block.input)
  return block.output
}
export const sin = (a) => trig(TrigonometryBlockOperations.Sin, a)
export const lerp = (a, b, t) => {
  const block = new LerpBlock('lerp')
  a.connectTo(block.left)
  b.connectTo(block.right)
  t.connectTo(block.gradient)
  return block.output
}
export const smooth = (value, e0, e1) => {
  const block = new SmoothStepBlock('smooth')
  value.connectTo(block.value)
  e0.connectTo(block.edge0)
  e1.connectTo(block.edge1)
  return block.output
}

// more graph helpers shared by the water and sky shaders
import { PowBlock } from '@babylonjs/core/Materials/Node/Blocks/powBlock.js'
import { NormalizeBlock } from '@babylonjs/core/Materials/Node/Blocks/normalizeBlock.js'
import { ClampBlock } from '@babylonjs/core/Materials/Node/Blocks/clampBlock.js'
import { DivideBlock } from '@babylonjs/core/Materials/Node/Blocks/divideBlock.js'
import { MaxBlock } from '@babylonjs/core/Materials/Node/Blocks/maxBlock.js'
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'

export const cos = (a) => trig(TrigonometryBlockOperations.Cos, a)
export const power = (a, p) => {
  const block = new PowBlock('pow')
  a.connectTo(block.value)
  p.connectTo(block.power)
  return block.output
}
export const normalize = (a) => {
  const block = new NormalizeBlock('normalize')
  a.connectTo(block.input)
  return block.output
}
export const clamp = (a, lo = 0, hi = 1) => {
  const block = new ClampBlock('clamp')
  block.minimum = lo
  block.maximum = hi
  a.connectTo(block.value)
  return block.output
}
export const divide = (a, b) => binary(DivideBlock, 'divide', a, b)
export const max = (a, b) => binary(MaxBlock, 'max', a, b)
export const sub = (a, b) => add(a, scale(b, num('neg', -1)))
export const vec3 = (name, v) => {
  const block = new InputBlock(name, undefined, T.Vector3)
  block.value = new Vector3(...v)
  block.isConstant = true
  return block.output
}
