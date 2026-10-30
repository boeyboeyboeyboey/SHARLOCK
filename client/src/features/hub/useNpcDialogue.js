import { computed, ref } from 'vue'

// one open conversation: the npc spoken to and the line shown
export function useNpcDialogue() {
  const npc = ref(null)
  const index = ref(0)
  const open = computed(() => npc.value !== null)
  const line = computed(() => npc.value?.lines[index.value] ?? '')
  const isLast = computed(() => !npc.value || index.value >= npc.value.lines.length - 1)

  function begin(next) {
    if (!next?.lines?.length) return false
    npc.value = next
    index.value = 0
    return true
  }
  function next() {
    if (!isLast.value) index.value += 1
  }
  function close() {
    npc.value = null
    index.value = 0
  }
  return { npc, index, open, line, isLast, begin, next, close }
}

// E in an open talk: next line, or close on the last one
export function advanceTalk(talk, close) {
  if (!talk.open.value) return false
  if (talk.isLast.value) close()
  else talk.next()
  return true
}
