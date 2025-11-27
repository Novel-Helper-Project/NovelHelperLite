<template>
  <q-page class="q-pa-md">
    <div ref="editorEl" style="height: calc(100vh - 140px); width: 100%"></div>
  </q-page>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import * as monaco from 'monaco-editor';
import 'monaco-editor/min/vs/editor/editor.main.css';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

const g = self as typeof self & {
  MonacoEnvironment: {
    getWorker(_: unknown, label: string): Worker;
  };
};

g.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === 'json') return new JsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  },
};

const editorEl = ref<HTMLDivElement | null>(null);
let editor: monaco.editor.IStandaloneCodeEditor | null = null;

onMounted(() => {
  if (!editorEl.value) return;
  editor = monaco.editor.create(editorEl.value, {
    value: 'function hello() {\n  console.log("Hello, Monaco");\n}\n',
    language: 'typescript',
    theme: 'vs-dark',
    automaticLayout: true,
  });
});

onBeforeUnmount(() => {
  editor?.dispose();
});
</script>
