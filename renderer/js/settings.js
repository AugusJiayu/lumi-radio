/**
 * 设置逻辑（通过 API 与后端交互）
 */
class Settings {
  constructor() {
    this.config = null;
    this.loadConfig();
  }

  async loadConfig() {
    try {
      const res = await fetch(`${API_BASE}/api/config`);
      this.config = await res.json();
    } catch {}
  }

  async saveConfig(updates) {
    try {
      const res = await fetch(`${API_BASE}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

const settings = new Settings();
