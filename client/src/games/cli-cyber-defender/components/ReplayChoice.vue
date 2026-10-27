<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { listAttemptContexts, safeAttemptError } from '../../../features/attempts/api.js'

const props = defineProps({
  context: { type: Object, default: () => ({ kind: 'personal' }) },
  mode: { type: String, default: 'timed' },
})
const emit = defineEmits(['change'])

const open = ref(false)
const selected = ref(props.context.kind === 'cohort' ? props.context.cohortId : 'personal')
const chosenMode = ref(props.mode === 'practice' ? 'practice' : 'timed')
const classes = ref([])
const loaded = ref(false)
const loading = ref(false)
const error = ref('')
const droppedClass = ref(false)
const controller = new AbortController()

const classLabel = computed(() => {
  const match = classes.value.find((item) => item.cohortId === selected.value)
  return match ? `${match.institutionName} · ${match.cohortName}` : 'Your class'
})
const destination = computed(() =>
  selected.value === 'personal' ? 'Personal practice' : classLabel.value,
)
const modeText = computed(() => (chosenMode.value === 'practice' ? 'Practice' : 'Timed'))

function publish() {
  emit('change', {
    mode: chosenMode.value,
    context:
      selected.value === 'personal'
        ? { kind: 'personal' }
        : { kind: 'cohort', cohortId: selected.value },
  })
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const rows = []
    let page = 1
    let result
    do {
      result = await listAttemptContexts(page, controller.signal)
      rows.push(...result.cohorts)
      page += 1
    } while (rows.length < result.total && result.cohorts.length && page <= 200)
    classes.value = rows
    loaded.value = true
    const stillListed = rows.some((item) => item.cohortId === selected.value)
    if (selected.value !== 'personal' && !stillListed) {
      selected.value = 'personal'
      droppedClass.value = true
      publish()
    }
  } catch (failure) {
    if (!controller.signal.aborted) error.value = safeAttemptError(failure).message
  } finally {
    loading.value = false
  }
}

function toggle() {
  open.value = !open.value
  if (open.value && !loaded.value && !loading.value) load()
}

onMounted(() => {
  publish()
  // a class label needs the list, so fetch it up front when the last run was in a class
  if (selected.value !== 'personal') load()
})
onBeforeUnmount(() => controller.abort())
</script>

<template>
  <div class="cli-replay">
    <p class="cli-replay-summary" data-testid="cli-next-run">
      Next run: {{ destination }} &middot; {{ modeText }}
    </p>
    <button
      type="button"
      class="btn cli-replay-toggle"
      aria-controls="cli-replay-options"
      :aria-expanded="open"
      @click="toggle"
    >
      Change
    </button>
    <div v-show="open" id="cli-replay-options" class="cli-replay-options">
      <div>
        <label for="cli-replay-context">Save this run to</label>
        <select
          id="cli-replay-context"
          v-model="selected"
          class="form-select"
          :disabled="loading"
          @change="publish"
        >
          <option value="personal">Personal practice</option>
          <option v-for="item in classes" :key="item.cohortId" :value="item.cohortId">
            {{ item.institutionName }} &middot; {{ item.cohortName }}
          </option>
          <option v-if="selected !== 'personal' && !loaded" :value="selected">Your class</option>
        </select>
        <p v-if="loading" class="cli-note" role="status">Checking available classes&hellip;</p>
        <p v-else-if="error" class="cli-note" role="alert">
          {{ error }}
          <button type="button" class="btn btn-sm" @click="load">Retry class list</button>
        </p>
        <p v-else-if="droppedClass" class="cli-note" role="status">
          Your last class is no longer available, so Personal practice is selected.
        </p>
        <p v-else-if="loaded && !classes.length" class="cli-note" role="status">
          You have no active classes, so only Personal practice is available.
        </p>
      </div>
      <fieldset class="cli-replay-modes">
        <legend>Mode</legend>
        <label class="cli-replay-radio">
          <input
            v-model="chosenMode"
            type="radio"
            name="cli-replay-mode"
            value="timed"
            @change="publish"
          />
          Timed
        </label>
        <label class="cli-replay-radio">
          <input
            v-model="chosenMode"
            type="radio"
            name="cli-replay-mode"
            value="practice"
            @change="publish"
          />
          Practice
        </label>
      </fieldset>
    </div>
  </div>
</template>
