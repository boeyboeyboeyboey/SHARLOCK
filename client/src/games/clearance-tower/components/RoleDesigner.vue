<script setup>
import { computed } from 'vue'
import {
  addRole,
  dutyWarnings,
  removeRole,
  roleIdsFor,
  toggleAssignment,
  toggleItem,
  updateRole,
} from '../clearanceTower.js'

const MAX_ROLES = 8
const MAX_NAME_LENGTH = 24

const props = defineProps({
  level: { type: Object, required: true },
  modelValue: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const roles = computed(() => props.modelValue.roles)
const warnings = computed(() => dutyWarnings(props.level, props.modelValue))

function update(policy) {
  emit('update:modelValue', policy)
}

function togglePermission(role, permissionId) {
  update(
    updateRole(props.modelValue, role.id, {
      permissions: toggleItem(role.permissions, permissionId),
    }),
  )
}
</script>

<template>
  <div class="clear-roles">
    <h3>Roles</h3>
    <p v-if="!roles.length" class="clear-hint">No roles yet. Add one, then tick its permissions.</p>
    <fieldset v-for="role in roles" :key="role.id" class="clear-role-card">
      <legend class="visually-hidden">{{ role.name }}</legend>
      <div class="clear-role-head">
        <label class="clear-field">
          <span>Role name</span>
          <input
            type="text"
            :value="role.name"
            :maxlength="MAX_NAME_LENGTH"
            :disabled="disabled"
            @input="update(updateRole(modelValue, role.id, { name: $event.target.value }))"
          />
        </label>
        <button
          type="button"
          class="clear-button"
          :disabled="disabled"
          :aria-label="`Remove role ${role.name}`"
          @click="update(removeRole(modelValue, role.id))"
        >
          Remove
        </button>
      </div>
      <div class="clear-checks">
        <label v-for="permission in level.permissions" :key="permission.id" class="clear-check">
          <input
            type="checkbox"
            :checked="role.permissions.includes(permission.id)"
            :disabled="disabled"
            @change="togglePermission(role, permission.id)"
          />
          {{ permission.name }}
        </label>
      </div>
    </fieldset>
    <button
      type="button"
      class="clear-button"
      :disabled="disabled || roles.length >= MAX_ROLES"
      @click="update(addRole(modelValue))"
    >
      Add role
    </button>

    <h3>Badges</h3>
    <div class="clear-table-wrap">
      <table class="clear-table">
        <caption>
          Tick the roles each agent holds
        </caption>
        <thead>
          <tr>
            <th scope="col">Agent</th>
            <th v-for="role in roles" :key="role.id" scope="col">{{ role.name }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="agent in level.agents" :key="agent.id">
            <th scope="row">
              {{ agent.name }}<span class="clear-row-note">{{ agent.title }}</span>
            </th>
            <td v-for="role in roles" :key="role.id">
              <label class="clear-badge-cell">
                <input
                  type="checkbox"
                  :checked="roleIdsFor(modelValue, agent.id).includes(role.id)"
                  :disabled="disabled"
                  @change="update(toggleAssignment(modelValue, agent.id, role.id))"
                />
                <span class="visually-hidden">{{ agent.name }} holds {{ role.name }}</span>
              </label>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="clear-duties">
      <h3>Separation of duties</h3>
      <ul>
        <li v-for="constraint in level.constraints" :key="constraint.reason">
          {{ constraint.reason }}
        </li>
      </ul>
      <p v-if="warnings.length" class="clear-warning" role="status">
        Conflict: {{ warnings.join(' ') }}
      </p>
    </div>
  </div>
</template>
