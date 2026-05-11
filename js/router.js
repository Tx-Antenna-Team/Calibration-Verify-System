// CVS — SPA Router (hash-based)

const routes = {};
let currentPage = null;

export function registerRoute(hash, loader) {
  routes[hash] = loader;
}

export async function navigate(hash) {
  if (!hash || hash === "#") hash = "#login";
  const page = hash.replace("#", "");
  if (currentPage === page) return;

  const loader = routes[hash];
  if (!loader) {
    console.warn("Route not found:", hash);
    return;
  }

  // Load page HTML
  const appEl = document.getElementById("app");
  appEl.innerHTML = '<div class="loading-spinner"></div>';

  try {
    const html = await fetch(`pages/${page}.html`).then(r => r.text());
    appEl.innerHTML = html;
    currentPage = page;

    // Run page initializer
    await loader();

    // Apply language after page load
    const { applyLanguage } = await import("./i18n.js");
    applyLanguage();

    // Update active nav item
    updateNav(hash);
  } catch (err) {
    console.error("Router error:", err);
    appEl.innerHTML = `<div class="page-body"><div class="empty-state"><div class="empty-icon">⚠️</div><p>Error loading page: ${err.message}</p></div></div>`;
  }
}

function updateNav(hash) {
  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.getAttribute("data-route") === hash);
  });
}

// Listen to hash changes
window.addEventListener("hashchange", () => navigate(window.location.hash));

export function getCurrentPage() { return currentPage; }
