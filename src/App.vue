<template>
  <div class="app-shell">
    <header class="app-header">
      <h1>Image Editor</h1>
      <nav class="nav">
        <RouterLink to="/">Home</RouterLink>
      </nav>
    </header>

    <main class="app-content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: grid;
  gap: 1.25rem;
}

.app-header {
  display: grid;
  gap: 0.75rem;
}

.nav {
  display: flex;
  gap: 1rem;
}

.nav a {
  text-decoration: none;
  color: #fff;
  font-weight: 600;
}

.nav a.router-link-active {
  color: skyblue;
}

.app-content {
  border-top: 1px solid #e5e7eb;
  padding-top: 1rem;
}
</style>
