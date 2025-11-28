<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated class="app-header">
      <q-toolbar>
        <q-toolbar-title>Novel Helper</q-toolbar-title>
        <div class="header-meta">Quasar v{{ $q.version }}</div>
      </q-toolbar>
    </q-header>

    <q-page-container class="workspace-shell">
      <VscodeSidebar />
      <div class="workspace-main">
        <router-view />
      </div>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import VscodeSidebar from 'components/VscodeSidebar.vue';
</script>
