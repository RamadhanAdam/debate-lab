const NAV_ORDER = [
  "getting-started",
  "web-ui",
  "workspace",
  "cli",
  "agents",
  "security",
  "profiles",
];

const titleEl = document.getElementById("doc-title");
const summaryEl = document.getElementById("doc-summary");
const contentEl = document.getElementById("doc-content");
const tocEl = document.getElementById("doc-toc");
const navEl = document.getElementById("docs-nav");
const relatedEl = document.getElementById("doc-related");
const indexLink = document.getElementById("docs-index");
const specialEl = document.getElementById("doc-special");

function firstParagraph(text) {
  const lines = text.split("\n").map((line) => line.trim());
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    return line;
  }
  return "";
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/[`"'’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function loadNav(activeSlug) {
  const res = await fetch("/api/docs");
  const data = await res.json();
  const docs = (data.docs || []).sort((a, b) => NAV_ORDER.indexOf(a.slug) - NAV_ORDER.indexOf(b.slug));

  navEl.innerHTML = docs.map((doc) => `
    <button class="docs-nav-item ${doc.slug === activeSlug ? "active" : ""}" data-slug="${doc.slug}">
      <span class="docs-nav-title">${doc.title}</span>
      <span class="docs-nav-summary">${doc.summary || "Open the guide"}</span>
    </button>
  `).join("");

  navEl.querySelectorAll("[data-slug]").forEach((button) => {
    button.addEventListener("click", () => {
      const slug = button.getAttribute("data-slug");
      window.location.href = `/docs/${slug}`;
    });
  });

  relatedEl.innerHTML = docs
    .filter((doc) => doc.slug !== activeSlug)
    .slice(0, 4)
    .map((doc) => `
      <a class="docs-related-item" href="${doc.url}">
        <div class="docs-related-title">${doc.title}</div>
        <div class="docs-related-summary">${doc.summary || "Open the guide"}</div>
      </a>
    `).join("");

  indexLink.href = "/docs/getting-started";
}

function buildToc() {
  const headings = contentEl.querySelectorAll("h2, h3");
  if (!headings.length) {
    tocEl.innerHTML = '<div class="docs-empty">This guide has no section headings yet.</div>';
    return;
  }

  tocEl.innerHTML = Array.from(headings).map((heading) => {
    const level = heading.tagName.toLowerCase();
    const id = heading.id || slugify(heading.textContent);
    heading.id = id;
    return `
      <a class="docs-toc-link ${level}" href="#${id}">${heading.textContent}</a>
    `;
  }).join("");
}

function normalizeImages() {
  contentEl.querySelectorAll("img").forEach((img) => {
    img.loading = "lazy";
  });
}

function renderGettingStartedSwitcher() {
  const platforms = [
    {
      id: "linux",
      title: "Linux",
      note: "Open the site in a modern browser, sign in, upload a file, and start a review from the main screen.",
      code: `1. Open the site in Firefox or Chrome.
2. Sign in.
3. Upload a note or folder.
4. Run a review and save the result.`,
    },
    {
      id: "macos",
      title: "macOS",
      note: "Open the site in Safari or Chrome, keep the browser window side by side with your notes if that helps, and use the workspace from there.",
      code: `1. Open the site in Safari or Chrome.
2. Sign in.
3. Keep the docs and workspace open together.
4. Upload, review, and save.`,
    },
    {
      id: "windows",
      title: "Windows",
      note: "Open the site in Edge or Chrome, then upload material and work from the right panel just like on any other platform.",
      code: `1. Open the site in Edge or Chrome.
2. Sign in.
3. Upload files or create a folder.
4. Run the debate and save the report.`,
    },
  ];

  specialEl.innerHTML = `
    <section class="platform-switcher">
      <div class="platform-switcher-head">
        ${platforms.map((platform, index) => `
          <button class="platform-switcher-tab ${index === 0 ? "active" : ""}" data-platform-tab="${platform.id}">${platform.title}</button>
        `).join("")}
      </div>
      <div class="platform-switcher-body">
        ${platforms.map((platform, index) => `
          <div class="platform-switcher-panel ${index === 0 ? "active" : ""}" data-platform-panel="${platform.id}">
            <p class="platform-switcher-note">${platform.note}</p>
            <pre class="platform-switcher-code">${platform.code}</pre>
          </div>
        `).join("")}
      </div>
    </section>
  `;

  const tabs = Array.from(specialEl.querySelectorAll("[data-platform-tab]"));
  const panels = Array.from(specialEl.querySelectorAll("[data-platform-panel]"));
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const id = tab.getAttribute("data-platform-tab");
      tabs.forEach((item) => item.classList.toggle("active", item === tab));
      panels.forEach((panel) => panel.classList.toggle("active", panel.getAttribute("data-platform-panel") === id));
    });
  });
}

async function loadDoc(slug) {
  const res = await fetch(`/api/docs/${encodeURIComponent(slug)}`);
  if (!res.ok) {
    titleEl.textContent = "Guide not found";
    summaryEl.textContent = "The requested guide does not exist.";
    contentEl.innerHTML = "<p>Try the documentation index instead.</p>";
    tocEl.innerHTML = "";
    relatedEl.innerHTML = "";
    return;
  }

  const data = await res.json();
  const content = data.content || "";
  const summary = firstParagraph(content);

  document.title = `${data.title} · Debate Lab Docs`;
  titleEl.textContent = data.title;
  summaryEl.textContent = summary;
  contentEl.innerHTML = marked.parse(content);
  normalizeImages();
  buildToc();
  if (specialEl) {
    specialEl.innerHTML = "";
    if (slug === "getting-started") {
      renderGettingStartedSwitcher();
    }
  }
}

async function init() {
  const slug = window.location.pathname.replace(/^\/docs\/?/, "") || "getting-started";
  await loadNav(slug);
  await loadDoc(slug);
}

init().catch((error) => {
  titleEl.textContent = "Documentation unavailable";
  summaryEl.textContent = error.message;
  contentEl.innerHTML = "<p>We could not load the documentation right now.</p>";
});
