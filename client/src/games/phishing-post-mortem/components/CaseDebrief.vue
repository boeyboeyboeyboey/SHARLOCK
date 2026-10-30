<script setup>
defineProps({
  result: { type: Object, required: true },
})
defineEmits(['replay'])
</script>

<template>
  <section class="sharmail-debrief" aria-labelledby="phish-debrief-heading">
    <header
      class="sharmail-debrief-head"
      :class="result.result.emailCorrect ? 'is-correct' : 'is-missed'"
    >
      <p class="sharmail-debrief-eyebrow">
        {{ result.result.emailCorrect ? 'Verdict upheld' : 'Verdict overturned' }}
      </p>
      <h2 id="phish-debrief-heading" tabindex="-1">
        {{ result.score }} / {{ result.maxScore }} points
      </h2>
      <p>{{ result.feedback.summary }}</p>
      <p class="sharmail-debrief-unsaved">
        Not saved. Sign-in and saved results are a separate piece of work, so this score is for this
        sitting only.
      </p>
    </header>

    <h3>What actually happened</h3>
    <p class="sharmail-debrief-summary">{{ result.debrief.summary }}</p>
    <p class="sharmail-debrief-patient">
      <span>Patient Zero</span>
      <strong>{{ result.debrief.patientZero.subject }}</strong>
      <span class="sharmail-address">
        {{ result.debrief.patientZero.senderName }} &lt;{{
          result.debrief.patientZero.senderAddress
        }}&gt;
      </span>
    </p>
    <ol class="sharmail-chain">
      <li v-for="(step, index) in result.debrief.chain" :key="index">{{ step }}</li>
    </ol>

    <h3>Your clues</h3>
    <ul class="sharmail-evidence-review">
      <li
        v-for="item in result.debrief.evidence"
        :key="item.id"
        :class="{ 'is-correct': item.correct, 'is-selected': item.selected }"
      >
        <p class="sharmail-evidence-verdict">
          <span class="sharmail-tag">{{
            item.correct ? 'Supports the chain' : 'Does not prove it'
          }}</span>
          <span v-if="item.selected" class="sharmail-tag is-chosen">You chose this</span>
        </p>
        <p class="sharmail-evidence-claim">{{ item.label }}</p>
        <p class="sharmail-evidence-note">{{ item.note }}</p>
      </li>
    </ul>

    <h3>The other suspicious messages</h3>
    <ul class="sharmail-decoys">
      <li v-for="decoy in result.debrief.decoys" :key="decoy.emailId">
        <p class="sharmail-decoy-subject">{{ decoy.subject }}</p>
        <p>{{ decoy.note }}</p>
      </li>
    </ul>

    <button type="button" class="sharmail-submit" @click="$emit('replay')">
      Investigate the other case
    </button>
  </section>
</template>
