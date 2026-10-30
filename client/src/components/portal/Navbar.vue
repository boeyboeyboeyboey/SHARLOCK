<script setup>
defineOptions({ name: 'SharlockNavbar' })
import { ref } from 'vue'
import ImmersiveControls from '../../features/menu/ImmersiveControls.vue'
defineProps({
  menuOpen: { type: Boolean, default: false },
  user: { type: Object, default: null },
  logoutPending: { type: Boolean, default: false },
})
defineEmits(['update:menuOpen', 'signOut'])
const controls = ref(null)
defineExpose({ focusMenu: () => controls.value?.focusMenu() })
</script>
<template>
  <header class="portal-header navbar">
    <RouterLink to="/" class="navbar-brand brand-mark" aria-label="Sharlock Hub home"
      ><img
        src="/images/sharlock-placeholder.svg"
        class="navbar-mascot"
        width="52"
        height="52"
        alt="Sharlock, the 3D-style capybara mascot wearing a monocle"
      /><span class="brand-title d-none d-md-inline">Sharlock Hub</span></RouterLink
    >
    <ImmersiveControls
      ref="controls"
      inline
      skin="pixel"
      :menu-open="menuOpen"
      :user="user"
      :logout-pending="logoutPending"
      @update:menu-open="$emit('update:menuOpen', $event)"
      @sign-out="$emit('signOut')"
    />
  </header>
</template>
