export const AGENT_META = {
  gpt: { initials: "GP", name: "GPT-4.1", cls: "gpt", color: "#3fb950" },
  groq: { initials: "LL", name: "Llama 3.3", cls: "groq", color: "#da3633" },
  gemini: { initials: "GM", name: "Gemini Flash", cls: "gemini", color: "#388bfd" },
  kimi: { initials: "KM", name: "Moonshot Kimi", cls: "kimi", color: "#ff6b35" },
  deepseek: { initials: "DS", name: "DeepSeek", cls: "deepseek", color: "#4d9fff" },
  claude: { initials: "CL", name: "Claude 3.5 Haiku", cls: "claude", color: "#cc785c" },
  human: { initials: "YO", name: "You", cls: "human", color: "#d4a017" },
};

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
