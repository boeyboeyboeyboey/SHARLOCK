// pure jump and hop state for sharlock: no babylon, driven only by dt and the support flag
export const GRAVITY = 9.81
export const APEX = 0.65
export const JUMP_SPEED = Math.sqrt(2 * GRAVITY * APEX)
export const COYOTE = 0.08
// a press this soon before touching down still counts
export const BUFFER = 0.1
// support readings this soon after launch are the take-off itself, not a landing
export const LIFT_OFF = 0.1
export const CROUCH = 0.08
export const SQUASH = 0.12
export const HOP_LENGTH = 0.35
export const HOP_HEIGHT = 0.14

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))

export function createJump() {
  let air = false
  let airTime = 0
  let unsupported = 0
  let buffered = 0
  let crouchAge = 99
  let squashAge = 99
  let hopAge = 99
  const pose = {
    launch: false,
    grounded: true,
    airborne: false,
    crouch: 0,
    stretch: 0,
    tuck: 0,
    squash: 0,
    hop: 0,
    active: false,
  }

  function request() {
    buffered = BUFFER
  }

  function hop() {
    hopAge = 0
  }

  // supported is the controller's ground check; calm drops the squash and stretch but keeps the jump
  function step(dt, { supported = true, calm = false, enabled = true } = {}) {
    unsupported = supported ? 0 : unsupported + dt
    buffered = Math.max(0, buffered - dt)
    let landed = false
    if (air) {
      airTime += dt
      if (supported && airTime > LIFT_OFF) {
        air = false
        landed = true
        squashAge = 0
      }
    }
    pose.launch = false
    if (buffered > 0 && enabled && !air && (supported || unsupported <= COYOTE)) {
      air = true
      airTime = 0
      buffered = 0
      crouchAge = 0
      squashAge = 99
      pose.launch = true
    } else if (!enabled) buffered = 0
    if (!pose.launch && !landed) {
      crouchAge += dt
      squashAge += dt
    }
    hopAge += dt
    pose.airborne = air
    // while a jump is in flight the controller must keep integrating gravity even if it still reads supported
    pose.grounded = supported && !air
    const rising = air ? clamp(1 - airTime / (JUMP_SPEED / GRAVITY)) : 0
    const mid = air ? clamp(airTime / 0.2) : 0
    const k = calm ? 0 : 1
    pose.crouch = crouchAge < CROUCH ? (1 - crouchAge / CROUCH) * k : 0
    pose.stretch = rising * k
    pose.tuck = mid * k
    pose.squash = squashAge < SQUASH ? Math.sin((squashAge / SQUASH) * Math.PI) * k : 0
    pose.hop = calm || hopAge >= HOP_LENGTH ? 0 : Math.sin((hopAge / HOP_LENGTH) * Math.PI)
    pose.active = air || squashAge < SQUASH || pose.launch
    return pose
  }

  return { step, request, hop, pose, isAirborne: () => air }
}
