import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation.js'

// publishes draw calls and triangle counts on the shared state
export function createInstrumentation({ scene, state }) {
  const instrumentation = new SceneInstrumentation(scene)
  // triangles are counted per pass, so the main pass is the delta across the camera render
  let beforeCamera = 0
  const beforeCam = scene.onAfterRenderTargetsRenderObservable.add(() => {
    beforeCamera = scene.getActiveIndices()
  })
  const afterFrame = scene.onAfterRenderObservable.add(() => {
    state.drawCalls = Math.round(instrumentation.drawCallsCounter.current)
    state.trianglesAllPasses = Math.round(scene.getActiveIndices() / 3)
    state.triangles = Math.round((scene.getActiveIndices() - beforeCamera) / 3)
  })
  return {
    dispose() {
      scene.onAfterRenderObservable.remove(afterFrame)
      scene.onAfterRenderTargetsRenderObservable.remove(beforeCam)
      instrumentation.dispose()
    },
  }
}
