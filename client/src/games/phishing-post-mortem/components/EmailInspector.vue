<script setup>
import { ref, toRef, watch } from 'vue'
import { mailTime } from '../phishing.js'

const props = defineProps({
  email: { type: Object, required: true },
})
const emit = defineEmits(['inspect-link'])

const revealed = ref([])
// a newly opened message starts with its destinations hidden again
watch(toRef(props, 'email'), () => {
  revealed.value = []
})

function toggleDestination(linkId) {
  if (revealed.value.includes(linkId)) {
    revealed.value = revealed.value.filter((id) => id !== linkId)
    return
  }
  revealed.value = [...revealed.value, linkId]
  emit('inspect-link', linkId)
}
</script>

<template>
  <article class="sharmail-reading">
    <h3 class="sharmail-reading-subject">{{ email.subject }}</h3>
    <dl class="sharmail-headers">
      <div>
        <dt>From</dt>
        <dd>
          <span class="sharmail-display-name">{{ email.senderName }}</span>
          <span class="sharmail-address">&lt;{{ email.senderAddress }}&gt;</span>
        </dd>
      </div>
      <div>
        <dt>Reply to</dt>
        <dd>
          <span class="sharmail-address">{{ email.replyTo }}</span>
        </dd>
      </div>
      <div>
        <dt>Received</dt>
        <dd>{{ mailTime(email.sentAt) }}</dd>
      </div>
    </dl>
    <div class="sharmail-body">
      <p>{{ email.bodyText }}</p>
    </div>
    <section v-if="email.links.length" class="sharmail-links" aria-label="Links in this message">
      <h4>Links</h4>
      <p class="sharmail-links-note">
        Links are inert here. Inspecting one shows where it really points without opening it.
      </p>
      <ul>
        <li v-for="link in email.links" :key="link.id">
          <span class="sharmail-link-label">{{ link.label }}</span>
          <button
            type="button"
            class="sharmail-inspect"
            :aria-expanded="revealed.includes(link.id)"
            @click="toggleDestination(link.id)"
          >
            {{ revealed.includes(link.id) ? 'Hide destination' : 'Inspect destination' }}
          </button>
          <p v-if="revealed.includes(link.id)" class="sharmail-destination">
            Points to <code>{{ link.destination }}</code>
          </p>
        </li>
      </ul>
    </section>
  </article>
</template>
