<template>
  <q-page class="column no-wrap editor-page">
    <MonacoEditorPane />
  </q-page>
</template>

<script setup lang="ts">
import MonacoEditorPane from 'components/MonacoEditorPane.vue';
</script>

<style scoped>
.editor-page {
  padding: 0;
  height: 100%;
}
</style>
