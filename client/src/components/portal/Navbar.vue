<script setup>
defineOptions({ name: 'SharlockNavbar' })
import { computed, ref } from 'vue'
import PixelIcon from '../town/PixelIcon.vue'
import { avatarFor } from '../../features/auth/avatars.js'
const props = defineProps({
  town: { type: Boolean, default: false },
  menuOpen: { type: Boolean, default: false },
  user: { type: Object, default: null },
  logoutPending: { type: Boolean, default: false },
})
defineEmits(['openMenu', 'signOut'])
const avatar = computed(() => avatarFor(props.user?.avatarId))
const roles = computed(() => props.user?.globalRoles ?? [])
const menuButton = ref(null)
defineExpose({ focusMenu: () => menuButton.value?.focus() })
</script>
<template>
  <header class="portal-header navbar" :class="{ 'account-town': town }">
    <RouterLink to="/" class="navbar-brand brand-mark" aria-label="Sharlock Hub home"
      ><img
        src="/images/sharlock-placeholder.svg"
        class="navbar-mascot"
        width="52"
        height="52"
        alt="Sharlock, the 3D-style capybara mascot wearing a monocle"
      /><span class="brand-title d-none d-md-inline">Sharlock Hub</span></RouterLink
    >
    <nav v-if="town" class="town-top-nav d-none d-md-flex" aria-label="Main navigation">
      <RouterLink to="/" class="town-map-link" aria-label="Town map"
        ><PixelIcon name="map" :size="16" /><span class="d-none d-lg-inline"
          >Town map</span
        ></RouterLink
      ><RouterLink to="/profile">Profile</RouterLink><RouterLink to="/progress">Progress</RouterLink
      ><RouterLink to="/leaderboard">Leaderboard</RouterLink>
    </nav>
    <div v-else class="header-note d-none d-xl-flex">
      <span class="tiny-dot"></span> A little curiosity. A safer digital world.
    </div>
    <div class="d-flex align-items-center gap-2">
      <RouterLink
        to="/about"
        class="header-link d-none"
        :class="town ? 'd-xl-inline-flex' : 'd-md-inline-flex'"
        >Meet Sharlock</RouterLink
      >
      <template v-if="user">
        <RouterLink
          v-if="roles.includes('admin')"
          to="/admin"
          class="header-link role-link role-link--admin d-none d-md-inline-flex"
          >Admin</RouterLink
        >
        <RouterLink
          v-if="roles.includes('instructor')"
          to="/instructor"
          class="header-link role-link role-link--instructor d-none d-md-inline-flex"
          >Instructor</RouterLink
        >
        <RouterLink
          v-if="!town"
          to="/profile"
          class="header-link account-link d-none d-md-inline-flex"
          :aria-label="`Your profile: ${user.username}`"
          :title="user.username"
        >
          <img :src="avatar.path" width="32" height="32" :alt="avatar.label" />
          <span class="account-name d-none d-xl-inline">{{ user.username }}</span>
        </RouterLink>
        <button
          class="header-link account-signout d-none d-md-inline-flex"
          type="button"
          :disabled="logoutPending"
          :aria-busy="logoutPending"
          @click="$emit('signOut')"
        >
          {{ logoutPending ? 'Signing…' : 'Sign out' }}
        </button>
      </template>
      <template v-else>
        <RouterLink to="/login" class="header-link">Sign in</RouterLink>
        <RouterLink to="/register" class="header-link">Create account</RouterLink>
      </template>
      <button
        ref="menuButton"
        class="icon-button mobile-menu d-md-none"
        type="button"
        aria-label="Open navigation and profile"
        aria-controls="portal-menu"
        :aria-expanded="menuOpen"
        @click="$emit('openMenu')"
      >
        <PixelIcon name="menu" :size="24" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.account-link {
  min-width: 0;
}
.account-link img {
  object-fit: contain;
  image-rendering: pixelated;
}
.account-name {
  max-width: 10ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-signout {
  border: 2px solid var(--border-strong);
  background: var(--surface);
  box-shadow: var(--shadow-pixel);
  padding: 0.4rem 0.6rem;
  min-height: 44px;
  flex-shrink: 0;
  white-space: nowrap;
}
@media (min-width: 768px) and (max-width: 991.98px) {
  .portal-header.account-town {
    gap: 8px;
  }
  .town-map-link {
    min-width: 44px;
    justify-content: center;
  }
}
</style>
