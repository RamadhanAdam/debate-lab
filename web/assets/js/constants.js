export const AGENT_META = {
  gpt: { initials: "GP", name: "GPT-4.1", cls: "gpt", color: "#3fb950", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l4.2 4.2L21 12l-4.8 5.8L12 22l-4.2-4.2L3 12l4.8-5.8z"/><path d="M9 12h6"/><path d="M12 9v6"/></svg>' },
  groq: { initials: "LL", name: "Llama-3.3 (Groq)", cls: "groq", color: "#da3633", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4.5 6v6.5c0 4.9 3.1 8.5 7.5 9.5 4.4-1 7.5-4.6 7.5-9.5V6z"/><path d="M8.5 10.2c1.1-1 2.4-1.7 3.5-1.7s2.4.7 3.5 1.7"/><path d="M8.8 14c1 .9 2 .9 3.2.9s2.2 0 3.2-.9"/></svg>' },
  gemini: { initials: "GM", name: "Gemini Flash", cls: "gemini", color: "#388bfd", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 8.8 8.8 2 12l6.8 3.2L12 22l3.2-6.8L22 12l-6.8-3.2z"/><path d="M12 6v12"/><path d="M6 12h12"/></svg>' },
  kimi: { initials: "KM", name: "Moonshot Kimi", cls: "kimi", color: "#ff6b35", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-8-8c-2.6 1.3-4.2 3.6-4.2 6.5 0 4.5 3.7 7.5 8.2 7.5 1.8 0 2.9-.3 4-1.2"/></svg>' },
  deepseek: { initials: "DS", name: "DeepSeek", cls: "deepseek", color: "#4d9fff", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 3"/><path d="M9.3 9.1h.01"/><path d="M14.7 9.1h.01"/><path d="M6 16c2-1.4 4.2-2 6-2s4 .6 6 2"/></svg>' },
  claude: { initials: "CL", name: "Claude 3.5 Haiku", cls: "claude", color: "#cc785c", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c3 2.2 5 5.1 6 8.6A8.5 8.5 0 1 1 12 2z"/><path d="M8 12h8"/><path d="M10 15.5h4"/><path d="M12 6v3"/></svg>' },
  human: { initials: "YO", name: "Human", cls: "human", color: "#d4a017", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"/><path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8"/><path d="M19 7h3"/><path d="M20.5 5.5v3"/></svg>' },
};

export const GENDER_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "nonbinary", label: "Non-binary" },
  { value: "unspecified", label: "Prefer not to say" },
];

export const PRONOUN_OPTIONS = [
  { value: "she/her", label: "She / her" },
  { value: "he/him", label: "He / him" },
  { value: "they/them", label: "They / them" },
  { value: "ask me", label: "Ask me" },
];

export const AVATAR_STYLES = [
  { value: "classic", label: "Classic" },
  { value: "soft", label: "Soft" },
  { value: "bold", label: "Bold" },
  { value: "editorial", label: "Editorial" },
  { value: "playful", label: "Playful" },
  { value: "minimal", label: "Minimal" },
  { value: "robot", label: "Robot" },
];

function hashString(value) {
  let hash = 0;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pick(items, index) {
  return items[index % items.length];
}

function escapeXml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function renderHumanAvatar(seed, options) {
  const hash = hashString(seed);
  const gender = options.gender || "unspecified";
  const style = options.style || "classic";
  const accent = options.accent || "#388bfd";

  const bg = pick(["#1d4ed8", "#0f766e", "#7c3aed", "#b45309", "#2563eb", "#c026d3", "#0f172a", "#0b7285"], hash + 1);
  const skin = pick(["#f2d7c3", "#eac086", "#d8a379", "#c68642", "#8d5524"], hash + 2);
  const hair = pick(["#2f1b12", "#5c4033", "#1f2937", "#8b5a2b", "#d97706", "#111827", "#a16207"], hash + 3);
  const shirt = pick([accent, "#22c55e", "#ec4899", "#f97316", "#14b8a6", "#6366f1", "#f59e0b", "#ef4444"], hash + 4);
  const accessory = pick(["none", "glasses", "headphones", "cap", "earring"], hash + 5);
  const faceY = style === "soft" ? 42 : 40;
  const faceW = style === "bold" ? 34 : 32;
  const faceH = style === "soft" ? 38 : 36;
  const eyeY = style === "soft" ? 42 : 41;
  const eyeOffset = style === "bold" ? 6 : 5;
  const mouthY = style === "bold" ? 56 : 55;
  const hairExtra = style === "bold" ? 3 : 0;

  const longHair = `
    <path d="M18 42c0-16 11-26 26-26s26 10 26 26v10c0 13-8 22-20 24H38c-12-2-20-11-20-24V42z" fill="${hair}"/>
    <path d="M20 40c5-17 15-24 24-24s19 7 24 24" fill="none" stroke="${hair}" stroke-width="12" stroke-linecap="round"/>
  `;
  const shortHair = `
    <path d="M22 38c2-13 11-21 24-21s22 8 24 21v4c-7-6-14-8-24-8s-17 2-24 8v-4z" fill="${hair}"/>
  `;
  const mediumHair = `
    <path d="M18 40c0-13 11-22 28-22s28 9 28 22c-7-5-14-7-28-7s-21 2-28 7z" fill="${hair}"/>
    <path d="M18 40c1 11 5 18 11 23" fill="none" stroke="${hair}" stroke-width="7" stroke-linecap="round"/>
    <path d="M66 40c-1 11-5 18-11 23" fill="none" stroke="${hair}" stroke-width="7" stroke-linecap="round"/>
  `;
  const beard = `
    <path d="M37 53c2 5 6 8 11 8s9-3 11-8c-2 8-6 13-11 13s-9-5-11-13z" fill="${hair}"/>
  `;
  const glasses = `
    <g fill="none" stroke="#0f172a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="38" cy="${eyeY}" r="4.5"></circle>
      <circle cx="50" cy="${eyeY}" r="4.5"></circle>
      <path d="M42.5 ${eyeY}h3"></path>
    </g>
  `;
  const earrings = gender === "female" || gender === "nonbinary" ? `
    <circle cx="24" cy="50" r="1.6" fill="${accent}"/>
    <circle cx="62" cy="50" r="1.6" fill="${accent}"/>
  ` : "";

  const styleHair = (() => {
    if (gender === "male") return shortHair + (style === "bold" ? beard : "");
    if (gender === "female") return longHair;
    if (gender === "nonbinary") return mediumHair;
    return [longHair, shortHair, mediumHair][hash % 3];
  })();

  const showGlasses = accessory === "glasses" || style === "soft" || style === "bold" || (hash % 5 === 0);
  const showHeadphones = accessory === "headphones" || style === "playful";
  const showCap = accessory === "cap" || style === "minimal";
  const mouth = style === "soft"
    ? `<path d="M42 56c2 1 4 1 6 0" stroke="#7c2d12" stroke-width="2" stroke-linecap="round" fill="none"/>`
    : `<path d="M40 56c2 2 4 3 8 3s6-1 8-3" stroke="#7c2d12" stroke-width="2" stroke-linecap="round" fill="none"/>`;
  const shoulders = style === "bold"
    ? `<path d="M18 80c5-11 15-16 26-16s21 5 26 16" fill="${shirt}" opacity="0.95"/>`
    : `<path d="M16 80c6-10 15-15 28-15s22 5 28 15" fill="${shirt}" opacity="0.95"/>`;
  const cap = showCap ? `
    <path d="M24 33c4-8 11-12 16-12s12 4 16 12h-32z" fill="${hair}"/>
    <path d="M18 36c4-10 13-16 22-16s18 6 22 16" fill="none" stroke="${hair}" stroke-width="7" stroke-linecap="round"/>
  ` : "";
  const headphones = showHeadphones ? `
    <path d="M24 38c0-10 7-18 16-18s16 8 16 18" fill="none" stroke="#0f172a" stroke-width="5" stroke-linecap="round"/>
    <rect x="16" y="38" width="8" height="16" rx="4" fill="#0f172a"/>
    <rect x="56" y="38" width="8" height="16" rx="4" fill="#0f172a"/>
  ` : "";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" role="img" aria-label="${escapeXml(seed)} avatar">
      <defs>
        <linearGradient id="bg-${hash}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${bg}"/>
          <stop offset="100%" stop-color="${accent}"/>
        </linearGradient>
      </defs>
      <circle cx="40" cy="40" r="40" fill="url(#bg-${hash})"/>
      <circle cx="40" cy="40" r="31" fill="rgba(255,255,255,0.08)"/>
      ${shoulders}
      <ellipse cx="40" cy="${faceY}" rx="${faceW}" ry="${faceH}" fill="${skin}"/>
      <ellipse cx="40" cy="${faceY - 4}" rx="${faceW - 6}" ry="${faceH - 8}" fill="rgba(255,255,255,0.05)"/>
      ${cap}
      ${styleHair}
      ${headphones}
      ${showGlasses ? glasses : ""}
      <circle cx="${40 - eyeOffset}" cy="${eyeY}" r="2.3" fill="#111827"/>
      <circle cx="${40 + eyeOffset}" cy="${eyeY}" r="2.3" fill="#111827"/>
      ${mouth}
      ${earrings}
    </svg>
  `;
}

function renderRobotAvatar(seed, options) {
  const hash = hashString(seed);
  const accent = options.accent || "#388bfd";
  const chassis = pick(["#94a3b8", "#60a5fa", "#a855f7", "#14b8a6"], hash + 1);
  const panel = pick(["#e2e8f0", "#cbd5e1", "#dbeafe"], hash + 2);
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" role="img" aria-label="${escapeXml(seed)} avatar">
      <circle cx="40" cy="40" r="40" fill="${accent}"/>
      <rect x="18" y="22" width="44" height="36" rx="10" fill="${chassis}"/>
      <rect x="24" y="28" width="32" height="20" rx="6" fill="${panel}"/>
      <rect x="29" y="34" width="7" height="7" rx="3.5" fill="#0f172a"/>
      <rect x="44" y="34" width="7" height="7" rx="3.5" fill="#0f172a"/>
      <path d="M31 46c4 3 14 3 18 0" stroke="#0f172a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M40 14v8" stroke="${panel}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="40" cy="12" r="3" fill="${panel}"/>
      <path d="M24 58h32" stroke="${panel}" stroke-width="3" stroke-linecap="round"/>
    </svg>
  `;
}

export function avatarUrl(seed, options = {}) {
  const style = options.style || "classic";
  const svg = style === "robot"
    ? renderRobotAvatar(seed || "Researcher", options)
    : renderHumanAvatar(seed || "Researcher", options);
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
