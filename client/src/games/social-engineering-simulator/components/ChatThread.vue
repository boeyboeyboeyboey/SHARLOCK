<script setup>
import { nextTick, ref, watch } from 'vue'

const props = defineProps({
  messages: { type: Array, required: true },
  pending: { type: Boolean, default: false },
  personaName: { type: String, default: 'Caller' },
})

const thread = ref(null)

// keep the newest message and the typing line in view
watch(
  () => [props.messages.length, props.pending],
  async () => {
    await nextTick()
    if (thread.value) thread.value.scrollTop = thread.value.scrollHeight
  },
  { flush: 'post', immediate: true },
)
</script>

<template>
  <div ref="thread" class="soc-thread" role="log" aria-label="Conversation" aria-live="polite">
    <ol class="soc-thread-list">
      <li
        v-for="(message, index) in messages"
        :key="index"
        class="soc-message"
        :class="message.role === 'you' ? 'is-you' : 'is-colleague'"
      >
        <span class="soc-message-author"
          >{{ message.role === 'you' ? 'You' : personaName }}
          <span v-if="message.scripted" class="soc-chip">Scripted</span></span
        >
        <p class="soc-message-body">{{ message.content }}</p>
      </li>
    </ol>
    <p v-if="pending" class="soc-typing" role="status">&hellip;</p>
  </div>
</template>
