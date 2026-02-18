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
        <RouterLink class="side-btn" :to="{ name: 'home' }">A</RouterLink>
        <RouterLink class="side-btn" :to="{ name: 'b' }">B</RouterLink>
        <RouterLink class="side-btn" :to="{ name: 'c' }">C</RouterLink>
        <RouterLink class="side-btn" :to="{ name: 'd' }">D</RouterLink>
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
  display: grid;
  place-items: center;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #f8fafc;
  font-weight: 700;
  color: #475569;
  text-decoration: none;
}

.side-btn.router-link-active {
  border-color: #3b82f6;
  color: #1d4ed8;
  background: #eff6ff;
}

.app-content {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
