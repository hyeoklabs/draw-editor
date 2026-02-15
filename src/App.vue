<template>
  <section class="tablet-shell">
    <header class="top-bar">
      <div class="top-bar-left">
        <span class="dot" />
        <span class="dot" />
        <span class="dot" />
      </div>
    </header>

    <div class="content-grid">
      <aside class="left-sidebar">
        <button class="side-btn" type="button">A</button>
        <button class="side-btn" type="button">B</button>
        <button class="side-btn" type="button">C</button>
        <button class="side-btn" type="button">D</button>
      </aside>

      <main class="app-content">
        <RouterView />
      </main>
    </div>
  </section>
</template>

<script setup lang="ts"></script>

<style scoped>
.tablet-shell {
  width: 1024px;
  height: 768px;
  margin: 0 auto;
  display: grid;
  grid-template-rows: 56px 1fr;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  overflow: hidden;
  background: #f8fafc;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  border-bottom: 1px solid #e2e8f0;
  background: #ffffff;
}

.top-bar-left {
  display: flex;
  gap: 6px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #cbd5e1;
}

.content-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  overflow: hidden;
}

.left-sidebar {
  display: grid;
  grid-auto-rows: 44px;
  align-content: start;
  gap: 10px;
  padding: 10px;
  border-right: 1px solid #e2e8f0;
  background: #ffffff;
}

.side-btn {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #f8fafc;
  font-weight: 700;
  color: #475569;
}

.app-content {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
