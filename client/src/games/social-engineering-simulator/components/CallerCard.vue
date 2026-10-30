<script setup>
defineProps({ call: { type: Object, required: true } })
</script>

<template>
  <section class="soc-caller" aria-label="Caller">
    <span class="soc-caller-avatar" aria-hidden="true">{{ call.caller.displayName[0] }}</span>
    <div class="soc-caller-text">
      <p class="soc-caller-name">{{ call.caller.displayName }}</p>
      <p class="soc-caller-role">
        {{ call.caller.claimedRole }}, {{ call.caller.claimedDepartment }}
      </p>
    </div>
    <p class="soc-secret">
      <span>{{ call.secret.label }}</span>
      <code data-testid="soc-secret">{{ call.secret.value }}</code>
    </p>
  </section>
</template>
