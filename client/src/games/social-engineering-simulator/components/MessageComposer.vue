<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  disabled: { type: Boolean, default: false },
  maxLength: { type: Number, default: 1000 },
  restoreText: { type: String, default: '' },
})
const emit = defineEmits(['send'])

const draft = ref('')
const remaining = computed(() => props.maxLength - draft.value.length)

// put a failed message back, but never over something the player has since typed
watch(
  () => props.restoreText,
  (text) => {
    if (text && !draft.value) draft.value = text
  },
  { immediate: true },
)

function submit() {
  const text = draft.value.trim()
  if (!text || props.disabled) return
  emit('send', text)
  draft.value = ''
}

// enter sends, shift+enter inserts a newline
function onKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    submit()
  }
}
</script>

<template>
  <form class="soc-composer" @submit.prevent="submit">
    <label class="soc-composer-label" for="soc-composer-input">Your reply</label>
    <div class="soc-composer-field">
      <textarea
        id="soc-composer-input"
        v-model="draft"
        class="soc-composer-input"
        :maxlength="maxLength"
        :disabled="disabled"
        rows="2"
        @keydown="onKeydown"
      ></textarea>
      <button
        type="submit"
        class="soc-button soc-button-primary soc-composer-send"
        :disabled="disabled || !draft.trim()"
      >
        Send
      </button>
    </div>
    <span class="soc-composer-count" aria-live="off">{{ remaining }}</span>
  </form>
</template>
