<template>
  <div class="about-content">
    <div class="about-card">
      <div class="about-title">关于 Novel Helper Lite</div>
      <div class="about-meta">
        <div class="meta-row">
          <span class="meta-label">版本</span>
          <span class="meta-value">{{ version }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">作者</span>
          <span class="meta-value">Novel Helper 团队</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">网站</span>
          <a class="meta-link" href="https://anh.sirrus.cc" target="_blank" rel="noreferrer">
            https://anh.sirrus.cc
          </a>
        </div>
      </div>
      <p class="about-text">
        Novel Helper Lite 是为本地与移动场景设计的轻量版编辑器，支持文本、图片、PDF
        等常见内容的查看与编辑。感谢你使用并支持本项目！
      </p>
      <div class="about-meta">
        <div class="meta-row">
          <span class="meta-label">主要贡献者</span>
          <span class="meta-value contributors">
            <span class="contrib-name">@AndreaFrederica</span>
            <span class="contrib-name">@AuraElicase</span>
            <span class="contrib-name">@NovelHelper Team</span>
          </span>
        </div>
      </div>
      <div class="sub-card">
        <div class="sub-title">Novel Helper (VSCode 扩展版)</div>
        <p class="about-text">
          Novel Helper VSCode 版本专注于长篇写作：提供章节管理、情节/角色/世界观卡片、批注与标记、AI 辅助写作、导出备份等功能，帮助创作者在熟悉的 VSCode 环境中高效完成创作。
        </p>
        <ul class="feature-list">
          <li>设定包管理：角色/词汇/敏感词/正则高亮统一模型，JSON5/Markdown/TXT 兼容。</li>
          <li>智能辅助：名字生成器、错别字与语法检测、LLM 翻译与润色（可配合 Anh Chat）。</li>
          <li>写作视图：章节拖拽排序、统计仪表板、懒加载大纲、批注与伏笔管理。</li>
          <li>导出与同步：Typst 导出、多格式导出、WebDAV 同步（WIP）、初始化向导。</li>
        </ul>
        <div class="about-actions">
          <a
            class="link-btn"
            href="https://github.com/AndreaFrederica/andrea-novel-helper"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <a
            class="link-btn"
            href="https://marketplace.visualstudio.com/items?itemName=andreafrederica.andrea-novel-helper"
            target="_blank"
            rel="noreferrer"
          >
            MarketPlace
          </a>
          <a
            class="link-btn"
            href="https://open-vsx.org/extension/andreafrederica/andrea-novel-helper"
            target="_blank"
            rel="noreferrer"
          >
            OpenVSX
          </a>
        </div>
      </div>
      <div class="about-actions">
        <a
          class="link-btn"
          href="https://github.com/Novel-Helper-Project/NovelHelperLite"
          target="_blank"
          rel="noreferrer"
        >
          前往 GitHub
        </a>
        <a class="link-btn" href="https://blog.sirrus.cc" target="_blank" rel="noreferrer">
          查看文档
        </a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  version?: string;
}>();
</script>

<style scoped>
.about-content {
  flex: 1;
  padding: 16px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.about-card {
  max-width: 720px;
  width: 100%;
  border: 1px solid var(--vscode-border);
  background: var(--vscode-editor-background);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.about-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 12px;
  color: var(--vscode-text);
}

.about-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px 16px;
  margin-bottom: 12px;
}

.meta-row {
  display: flex;
  gap: 8px;
  font-size: 13px;
}

.meta-label {
  color: var(--vscode-muted);
  min-width: 48px;
}

.meta-value,
.meta-link {
  color: var(--vscode-text);
  word-break: break-all;
}

.contributors {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.contrib-name {
  padding: 4px 8px;
  border: 1px solid var(--vscode-border);
  border-radius: 8px;
  background: var(--vscode-input-background);
}

.meta-link {
  text-decoration: underline;
}

.about-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--vscode-descriptionForeground);
  margin: 12px 0;
}

.feature-list {
  margin: 8px 0 4px;
  padding-left: 18px;
  color: var(--vscode-text);
  line-height: 1.5;
  font-size: 13px;
}

.about-actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.link-btn {
  border: 1px solid var(--vscode-border);
  background: transparent;
  color: var(--vscode-text);
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
}

.link-btn:hover {
  background: var(--vscode-list-hoverBackground);
}

.sub-card {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--vscode-border);
  border-radius: 8px;
  background: var(--vscode-sideBar-background);
}

.sub-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--vscode-text);
}
</style>
