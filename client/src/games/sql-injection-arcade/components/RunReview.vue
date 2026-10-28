<script setup>
defineProps({ review: { type: Array, default: () => [] } })

const KINDS = {
  'login-tautology': 'Login bypass',
  'login-comment': 'Login as a named user',
  'login-numeric': 'Unquoted number',
  union: 'UNION',
  blind: 'Boolean blind',
  'second-order': 'Second-order',
  repair: 'Repair',
}
const OUTCOMES = { solved: 'Solved', failed: 'Failed', open: 'Left open' }
</script>

<template>
  <table class="sql-review">
    <caption>
      Run review
    </caption>
    <thead>
      <tr>
        <th scope="col">Case</th>
        <th scope="col">Kind</th>
        <th scope="col">Outcome</th>
        <th scope="col">Points</th>
        <th scope="col">Assisted</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(row, index) in review" :key="index">
        <td>{{ row.number ?? 'Repair' }}</td>
        <td>{{ KINDS[row.kind] ?? row.kind }}</td>
        <td>{{ OUTCOMES[row.outcome] ?? row.outcome }}</td>
        <td>{{ row.points }}</td>
        <td>{{ row.assisted ? 'Yes' : 'No' }}</td>
      </tr>
    </tbody>
  </table>
</template>
