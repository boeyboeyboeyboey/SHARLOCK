<script setup>
import { avatarFor } from '../auth/avatars.js'

defineProps({
  rows: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  view: { type: String, default: 'best' },
  caption: { type: String, default: '' },
})
</script>

<template>
  <div class="leaderboard__scroll">
    <table :aria-busy="loading">
      <caption>
        {{
          caption
        }}
      </caption>
      <thead>
        <tr v-if="view === 'all-time'">
          <th scope="col">Rank</th>
          <th scope="col">Player</th>
          <th scope="col">Points</th>
          <th scope="col">Plays</th>
          <th scope="col">Best</th>
        </tr>
        <tr v-else>
          <th scope="col">Rank</th>
          <th scope="col">Player</th>
          <th scope="col">Score</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="`${row.rank}-${row.username}`"
          :class="{ leaderboard__self: row.isSelf }"
        >
          <td>{{ row.rank }}</td>
          <th scope="row">
            <span class="leaderboard__player">
              <img
                :src="avatarFor(row.avatarId).path"
                width="32"
                height="32"
                :alt="`${avatarFor(row.avatarId).label} capybara avatar`"
                class="leaderboard__avatar"
              />
              <strong v-if="row.isSelf">{{ row.username }}</strong>
              <span v-else>{{ row.username }}</span>
              <span v-if="row.isSelf" class="visually-hidden"> (you)</span>
            </span>
          </th>
          <template v-if="view === 'all-time'">
            <td>{{ row.points }}</td>
            <td>{{ row.plays }}</td>
            <td>{{ row.bestScore }} / {{ row.maxScore }}</td>
          </template>
          <td v-else>{{ row.score }} / {{ row.maxScore }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
