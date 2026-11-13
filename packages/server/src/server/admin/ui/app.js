const state = {
  view: "overview",
  metadata: null,
  metadataMode: "automatic",
  roles: [],
  agents: [],
  titles: [],
  settings: null,
  runtimeSettings: null,
  settingsDirty: new Set(),
  team: null,
  activeMemberId: null,
  teamDays: 7,
};

const labels = {
  overview: ["服务概览", "管理台"],
  metadata: ["Agent 配置", "元数据"],
  roles: ["成员入口", "角色"],
  sessions: ["会话归属", "会话"],
  team: ["成员工作台", "团队管理"],
  titles: ["责任人核对", "标题归属清单"],
  settings: ["运行配置", "设置"],
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character];
  });
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(
    Number(value || 0),
  );
}

function formatDuration(seconds) {
  const minutes = Math.max(0, Math.round(Number(seconds || 0) / 60));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getConfigValue(config, path) {
  return path
    .split(".")
    .reduce((value, key) => (value && typeof value === "object" ? value[key] : undefined), config);
}

function setConfigValue(config, path, value) {
  const parts = path.split(".");
  let target = config;
  for (const part of parts.slice(0, -1)) {
    if (!target[part] || typeof target[part] !== "object" || Array.isArray(target[part])) {
      target[part] = {};
    }
    target = target[part];
  }
  const key = parts.at(-1);
  if (value === undefined) delete target[key];
  else target[key] = value;
}

function readConfigInput(input) {
  if (input.type === "checkbox") return input.checked;
  const raw = input.value.trim();
  if (!raw && input.required) throw new Error("请填写必填配置");
  if (!raw) return undefined;
  if (input.dataset.configUnion === "true-or-list") {
    if (raw.toLowerCase() === "true") return true;
    return raw
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (input.dataset.configList === "lines") {
    return raw
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (input.type === "number") {
    const value = Number(raw);
    return Number.isFinite(value) ? value : raw;
  }
  return raw;
}

function formatConfigValue(value) {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join("\n");
  return String(value);
}

function cloneConfig(config) {
  return structuredClone(config);
}

async function api(path, options = {}) {
  const headers = { ...options.headers };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { ...options, headers });
  if (response.status === 401) {
    showLogin();
    throw new Error("登录已失效");
  }
  if (!response.ok) {
    const detail = await response.text();
    try {
      throw new Error(JSON.parse(detail).error || detail);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(detail || `HTTP ${response.status}`, { cause: error });
      }
      throw error;
    }
  }
  if (response.status === 204) return null;
  return response.json();
}

function showLogin() {
  $("#login-view").hidden = false;
  $("#app-shell").hidden = true;
}

function showApp() {
  $("#login-view").hidden = true;
  $("#app-shell").hidden = false;
  void loadView(state.view);
}

function setGlobalError(message = "") {
  const element = $("#global-error");
  element.hidden = !message;
  element.textContent = message;
}

let toastTimer = null;
function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    element.hidden = true;
  }, 3600);
}

async function loadView(view) {
  state.view = view;
  for (const section of $$(".view")) section.hidden = section.id !== `view-${view}`;
  for (const button of $$(".nav-item"))
    button.classList.toggle("active", button.dataset.view === view);
  const [eyebrow, title] = labels[view];
  $("#view-eyebrow").textContent = eyebrow;
  $("#view-title").textContent = title;
  setGlobalError();
  try {
    if (view === "overview") await loadOverview();
    if (view === "metadata") await loadMetadata();
    if (view === "roles") await loadRoles();
    if (view === "sessions") await loadAgents();
    if (view === "team") await loadTeam();
    if (view === "titles") await loadTitles();
    if (view === "settings") await loadSettings();
  } catch (error) {
    setGlobalError(error instanceof Error ? error.message : String(error));
  }
}

async function loadSettings() {
  const data = await api("/api/settings");
  state.settings = data.config;
  state.runtimeSettings = data.runtimeConfig;
  renderSettings();
}

function renderSettings() {
  if (!state.settings) return;
  state.settingsDirty.clear();
  for (const input of $$("[data-config-path]")) {
    const runtimeValue = getConfigValue(state.runtimeSettings, input.dataset.configPath);
    const value =
      runtimeValue === undefined
        ? getConfigValue(state.settings, input.dataset.configPath)
        : runtimeValue;
    if (input.type === "checkbox") input.checked = value === true;
    else input.value = formatConfigValue(value);
  }
  $("#daemon-config-json").value = JSON.stringify(state.settings, null, 2);
}

function readSettingsForm() {
  const config = cloneConfig(state.settings);
  for (const input of $$("[data-config-path]", $("#daemon-settings-form"))) {
    if (!state.settingsDirty.has(input.dataset.configPath)) continue;
    setConfigValue(config, input.dataset.configPath, readConfigInput(input));
  }
  return config;
}

async function saveSettings(config, statusElement, retryButton) {
  statusElement.textContent = "正在保存…";
  try {
    const result = await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ config }),
    });
    state.settings = result.config;
    state.runtimeSettings = result.runtimeConfig;
    renderSettings();
    const messages = [];
    const restartPaths = result.reload?.restartRequiredPaths ?? [];
    const appliedPaths = result.reload?.appliedPaths ?? [];
    if (result.reloadError) {
      messages.push(`配置已写入，但热重载失败：${result.reloadError}`);
    } else if (appliedPaths.length) {
      messages.push("已保存并立即生效");
    } else {
      messages.push("配置已保存");
    }
    if (restartPaths.length) {
      messages.push(`需完整重启 daemon 后生效：${restartPaths.join("、")}`);
    }
    if (result.reload?.overrideControlledPaths?.length) {
      messages.push(`启动参数覆盖：${result.reload.overrideControlledPaths.join("、")}`);
    }
    retryButton.hidden = !result.reloadError;
    const message = messages.join("；") || "配置已保存";
    statusElement.textContent = message;
    toast(message);
  } catch (error) {
    statusElement.textContent = "";
    throw error;
  }
}

async function retrySettingsReload(statusElement, retryButton) {
  statusElement.textContent = "正在重新应用…";
  try {
    const result = await api("/api/settings/reload", { method: "POST" });
    state.runtimeSettings = result.runtimeConfig;
    renderSettings();
    const restartPaths = result.reload?.restartRequiredPaths ?? [];
    statusElement.textContent = restartPaths.length
      ? `配置已重新应用；仍需完整重启 daemon：${restartPaths.join("、")}`
      : "配置已重新应用";
    retryButton.hidden = true;
    toast(statusElement.textContent);
  } catch (error) {
    statusElement.textContent = `重新应用失败：${error.message}`;
  }
}

async function resetAdminKey() {
  const input = $("#new-admin-key");
  const key = input.value.trim() || "123456";
  if (!window.confirm("重置管理密钥后，当前及所有已登录浏览器都会退出。继续吗？")) return;
  $("#admin-key-status").textContent = "正在重置…";
  try {
    await api("/api/settings/admin-key", {
      method: "POST",
      body: JSON.stringify({ key }),
    });
  } catch (error) {
    $("#admin-key-status").textContent = "";
    throw error;
  }
  input.value = "";
  $("#admin-key-status").textContent = "";
  showLogin();
  $("#login-error").textContent = "管理密钥已重置，请使用新密钥重新登录。";
}

async function loadOverview() {
  const data = await api("/api/overview");
  $("#daemon-pill").dataset.state = "online";
  $("#daemon-pill").textContent = `Daemon ${data.daemon.version || "online"}`;
  $("#overview-cache").textContent = `PID ${data.daemon.pid}`;
  $("#overview-cards").innerHTML = [
    ["活动会话", data.counts.agents, `${data.counts.archivedAgents} 条已归档`],
    ["角色", data.counts.roles, "pair --name"],
    ["项目", data.counts.projects, `${data.counts.workspaces} 个工作区`],
    ["管理入口", "本机", "127.0.0.1 sidecar"],
  ]
    .map(
      ([label, value, note]) =>
        `<article class="stat-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`,
    )
    .join("");
  $("#daemon-details").innerHTML = [
    ["版本", data.daemon.version || "未知"],
    ["监听", data.daemon.listen || "未知"],
    ["运行 PID", data.daemon.pid],
    ["Node", data.daemon.nodePath || "未知"],
    ["启动时间", formatDate(data.daemon.startedAt)],
  ]
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("");
  $("#overview-roles").innerHTML =
    data.roles.map((role) => `<span class="role-pill">${escapeHtml(role.name)}</span>`).join("") ||
    `<span class="muted">尚未发现角色</span>`;
}

async function loadMetadata() {
  state.metadata = await api("/api/metadata");
  state.metadataMode = state.metadata.mode;
  renderMetadata();
  const provider = $("#metadata-provider").value;
  if (provider && !state.metadata.providers.find((item) => item.id === provider)?.models.length) {
    await loadMetadataModels(provider, state.metadata.model);
  }
}

function renderMetadata() {
  const data = state.metadata;
  if (!data) return;
  for (const button of $$("[data-metadata-mode]")) {
    button.classList.toggle("active", button.dataset.metadataMode === state.metadataMode);
  }
  $("#manual-model-row").hidden = state.metadataMode !== "manual";
  const provider = $("#metadata-provider");
  provider.innerHTML = data.providers
    .map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.label)}</option>`)
    .join("");
  provider.value = data.provider || data.providers[0]?.id || "";
  renderMetadataModels(data.model);
}

function renderMetadataModels(selectedModel) {
  const provider = $("#metadata-provider").value;
  const entry = state.metadata?.providers.find((item) => item.id === provider);
  $("#metadata-model").innerHTML = (entry?.models || [])
    .map((model) => `<option value="${escapeHtml(model.id)}">${escapeHtml(model.label)}</option>`)
    .join("");
  if (selectedModel) $("#metadata-model").value = selectedModel;
}

async function loadMetadataModels(provider, selectedModel = null) {
  const select = $("#metadata-model");
  select.disabled = true;
  select.innerHTML = `<option>正在加载模型…</option>`;
  try {
    const data = await api(`/api/metadata/models?provider=${encodeURIComponent(provider)}`);
    select.innerHTML = data.models
      .map((model) => `<option value="${escapeHtml(model.id)}">${escapeHtml(model.label)}</option>`)
      .join("");
    if (selectedModel) select.value = selectedModel;
  } finally {
    select.disabled = false;
  }
}

async function saveMetadata() {
  const provider = $("#metadata-provider").value;
  const model = $("#metadata-model").value;
  $("#metadata-status").textContent = "正在保存…";
  try {
    await api("/api/metadata", {
      method: "PUT",
      body: JSON.stringify({
        mode: state.metadataMode,
        provider,
        model,
      }),
    });
    $("#metadata-status").textContent = "已保存";
    toast("元数据配置已保存");
  } catch (error) {
    $("#metadata-status").textContent = "";
    throw error;
  }
}

function roleLabel(role) {
  return role === "admin" ? "管理员" : "成员";
}

async function loadRoles() {
  const data = await api("/api/roles");
  state.roles = data.roles;
  $("#role-count").textContent = `${data.roles.length} 个角色`;
  $("#roles-list").innerHTML =
    data.roles
      .map(
        (role) => `<div class="role-row">
          <strong>${escapeHtml(role.name)} <span class="badge ${role.role === "admin" ? "success" : ""}">${roleLabel(role.role)}</span></strong>
          <small>${role.sessions ?? 0} 会话 · ${role.questions ?? 0} 提问 · ${
            role.lastActiveAt ? formatDate(role.lastActiveAt) : "尚未使用"
          }</small>
          <div class="role-row-actions">
            <select data-role-value aria-label="${escapeHtml(role.name)} 的角色类型">
              <option value="member" ${role.role === "member" ? "selected" : ""}>成员</option>
              <option value="admin" ${role.role === "admin" ? "selected" : ""}>管理员</option>
            </select>
            <button class="text-button" data-role-regenerate="${escapeHtml(role.name)}">重新生成二维码</button>
            <button class="text-button danger" data-role-delete="${escapeHtml(role.id)}" data-role-name="${escapeHtml(role.name)}">删除</button>
          </div>
        </div>`,
      )
      .join("") || `<div class="empty-state">尚未创建角色。输入名称生成第一个入口。</div>`;
}

async function createRole(name, role) {
  const result = await api("/api/roles", {
    method: "POST",
    body: JSON.stringify({ name, role }),
  });
  const qr = result.qr
    ? `<img alt="${escapeHtml(name)} 的配对二维码" src="${escapeHtml(result.qr)}" />`
    : "";
  $("#qr-result").hidden = false;
  $("#qr-result").innerHTML = `
    <strong>${escapeHtml(name)} <span class="badge ${role === "admin" ? "success" : ""}">${roleLabel(role)}</span></strong>
    ${qr}
    <p class="helper">配对链接</p>
    <code>${escapeHtml(result.url)}</code>
    <div class="card-actions">
      <button class="secondary-button" type="button" data-copy-role-url="${escapeHtml(result.url)}">复制链接</button>
    </div>
  `;
  await loadRoles();
  toast(`已生成${roleLabel(role)}角色「${name}」`);
}

async function removeRole(id, name) {
  if (!window.confirm(`删除角色「${name}」？已发出的二维码不会立刻失效。`)) return;
  await api(`/api/roles/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadRoles();
  toast(`已删除角色「${name}」`);
}

async function loadAgents() {
  const data = await api("/api/agents");
  state.agents = data.agents;
  state.roles = data.roles;
  const owners = [...new Set(data.agents.map((agent) => agent.ownerName))].filter(Boolean);
  $("#agent-owner-filter").innerHTML =
    `<option value="">全部</option>` +
    owners.map((owner) => `<option>${escapeHtml(owner)}</option>`).join("");
  renderAgents();
}

function renderAgents() {
  const query = $("#agent-search").value.trim().toLowerCase();
  const owner = $("#agent-owner-filter").value;
  const agents = state.agents.filter((agent) => {
    if (owner && agent.ownerName !== owner) return false;
    if (!query) return true;
    return [agent.title, agent.projectName, agent.ownerName, agent.provider, agent.model]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
  $("#sessions-table").innerHTML = `
    <div class="table-head" role="row">
      <span>会话</span><span>负责人</span><span>项目</span><span>状态</span><span>操作</span>
    </div>
    ${
      agents
        .map(
          (agent) => `<div class="table-row" role="row">
            <div class="table-title">
              <strong>${escapeHtml(agent.title)}</strong>
              <small>${escapeHtml(agent.provider)}${agent.model ? ` · ${escapeHtml(agent.model)}` : ""} · ${formatDate(agent.updatedAt)}</small>
            </div>
            <span class="badge ${agent.ownerName === "未分配" ? "warning" : ""}">${escapeHtml(agent.ownerName)}</span>
            <span>${escapeHtml(agent.projectName)}</span>
            <span class="badge ${agent.status === "running" ? "success" : ""}">${escapeHtml(agent.status)}</span>
            <button class="text-button" data-owner-agent="${escapeHtml(agent.id)}" data-owner-current="${escapeHtml(agent.ownerName)}">转让</button>
          </div>`,
        )
        .join("") || `<div class="empty-state">没有匹配的会话。</div>`
    }
  `;
}

function openOwnerDialog(agentId, currentOwner) {
  const agent = state.agents.find((item) => item.id === agentId);
  if (!agent) return;
  $("#owner-dialog").dataset.agentId = agentId;
  $("#owner-dialog-agent").textContent = agent.title;
  $("#owner-select").innerHTML = state.roles
    .map(
      (role) =>
        `<option ${role.name === currentOwner ? "selected" : ""}>${escapeHtml(role.name)}</option>`,
    )
    .join("");
  $("#owner-dialog").showModal();
  $("#owner-select").focus();
}

async function transferOwner(agentId, name) {
  await api(`/api/agents/${encodeURIComponent(agentId)}/owner`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  await loadAgents();
  toast("负责人已转让并记录审计");
}

async function loadTeam() {
  const end = new Date();
  const start = new Date(end.getTime() - state.teamDays * 86400000);
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  state.team = await api(`/api/team?${params}`);
  const members = [...state.team.members, state.team.unassigned];
  if (!members.some((member) => member.id === state.activeMemberId)) {
    state.activeMemberId = members[0]?.id || null;
  }
  renderTeam();
}

function renderTeam() {
  if (!state.team) return;
  const members = [...state.team.members, state.team.unassigned];
  $("#team-tabs").innerHTML = members
    .map((member) => {
      const active = member.id === state.activeMemberId;
      return `<button class="member-tab ${active ? "active" : ""}" role="tab" aria-selected="${active}" data-member="${escapeHtml(member.id)}">
        <strong>${escapeHtml(member.name)}</strong>
        <small>${formatDuration(member.seconds)} · ${member.sessions} 会话</small>
      </button>`;
    })
    .join("");
  const member = members.find((item) => item.id === state.activeMemberId) || members[0];
  if (!member) {
    $("#team-content").innerHTML = `<div class="empty-state">尚未发现团队成员。</div>`;
    return;
  }
  $("#team-content").innerHTML = `
    <div class="team-stat-grid">
      ${stat("估算投入", formatDuration(member.seconds))}
      ${stat("提问", member.questionCount)}
      ${stat("完成轮次", member.completedTurns)}
      ${stat("Token", member.tokenDataAvailable ? formatNumber(member.inputTokens + member.outputTokens) : "—")}
      ${stat("会话", member.sessions)}
    </div>
    <div class="team-grid">
      <article class="panel">
        <div class="panel-heading"><h3>时间与分布</h3><span class="muted">并行会话已去重</span></div>
        <div class="allocation-grid">
          ${allocation("时间构成", member.timeComponents, member.seconds)}
          ${allocation("项目", member.projects, member.seconds)}
          ${allocation("会话", member.sessionDistribution, member.seconds)}
          <div class="allocation">
            <h4>Token 明细</h4>
            <div class="allocation-list">
              ${detailRow("输入", member.tokenDataAvailable ? formatNumber(member.inputTokens) : "尚未采集")}
              ${detailRow("缓存输入", member.tokenDataAvailable ? formatNumber(member.cachedInputTokens) : "尚未采集")}
              ${detailRow("输出", member.tokenDataAvailable ? formatNumber(member.outputTokens) : "尚未采集")}
              ${detailRow("费用", member.tokenDataAvailable ? `$${member.totalCostUsd.toFixed(4)}` : "尚未采集")}
            </div>
          </div>
        </div>
      </article>
      <article class="panel">
        <div class="panel-heading"><h3>时间热力图</h3><span class="muted">每格 15 分钟 · ${escapeHtml(state.team.timeZone)}</span></div>
        ${renderHeatmap(member.heatmap)}
      </article>
    </div>
  `;
}

function stat(label, value) {
  return `<article class="team-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function allocation(label, rows) {
  return `<section class="allocation">
    <h4>${escapeHtml(label)}</h4>
    <div class="allocation-list">
      ${
        rows
          .map(
            (row) => `<div class="allocation-row">
              <span title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</span>
              <b>${Math.round(row.share * 100)}%</b>
              <div class="allocation-bar"><i style="width:${Math.max(2, Math.round(row.share * 100))}%"></i></div>
            </div>`,
          )
          .join("") || `<span class="muted">暂无数据</span>`
      }
    </div>
  </section>`;
}

function detailRow(label, value) {
  return `<div class="list-row"><span>${escapeHtml(label)}</span><strong style="margin-left:auto">${escapeHtml(value)}</strong></div>`;
}

function renderHeatmap(days) {
  if (!days?.length) return `<div class="empty-state">当前范围没有可用的时间数据。</div>`;
  return `<div class="heatmap" aria-label="每格十五分钟的团队投入热力图">
    ${days
      .map(
        (day) => `<div class="heatmap-day">
          <span class="heatmap-date">${escapeHtml(day.date.slice(5))}</span>
          <div class="heatmap-slots">
            ${day.slots
              .map((seconds, index) => {
                const level = heatLevel(seconds);
                const hour = String(Math.floor(index / 4)).padStart(2, "0");
                const minute = String((index % 4) * 15).padStart(2, "0");
                return `<span class="heat-cell" data-level="${level}" title="${day.date} ${hour}:${minute} · ${formatDuration(seconds)}"></span>`;
              })
              .join("")}
          </div>
        </div>`,
      )
      .join("")}
    <div class="heat-legend"><span>空缺</span><i></i><i></i><i></i><i></i><span>满 15 分钟</span></div>
  </div>`;
}

async function loadTitles() {
  const data = await api("/api/titles");
  state.titles = data.items;
  renderTitles();
}

function renderTitles() {
  const query = $("#title-search").value.trim().toLowerCase();
  const rows = state.titles.filter((item) =>
    [item.agentTitle, item.workspaceTitle, item.ownerName].join(" ").toLowerCase().includes(query),
  );
  const sourceLabel = { role: "角色识别", manual: "人工归属", unassigned: "未分配" };
  $("#titles-table").innerHTML = `
    <div class="table-head" role="row"><span>Workspace / Agent</span><span>负责人</span><span>来源</span><span>更新时间</span><span></span></div>
    ${
      rows
        .map(
          (item) => `<div class="table-row" role="row">
            <div class="table-title">
              <strong>${escapeHtml(item.workspaceTitle || "未命名 Workspace")}</strong>
              <small>${escapeHtml(item.agentTitle || "无会话标题")}</small>
            </div>
            <span class="badge ${item.ownerSource === "unassigned" ? "warning" : ""}">${escapeHtml(item.ownerName)}</span>
            <span>${sourceLabel[item.ownerSource]}</span>
            <span>${formatDate(item.updatedAt)}</span>
            <span></span>
          </div>`,
        )
        .join("") || `<div class="empty-state">没有匹配的标题。</div>`
    }
  `;
}

function heatLevel(seconds) {
  if (seconds === 0) return 0;
  if (seconds < 180) return 1;
  if (seconds < 420) return 2;
  if (seconds < 780) return 3;
  return 4;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("paseo-admin-theme", theme);
}

document.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("paseo-admin-theme");
  applyTheme(savedTheme === "dark" ? "dark" : "light");

  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const key = $("#admin-key").value.trim();
    $("#login-error").textContent = "";
    if (!key) {
      $("#login-error").textContent = "请输入管理密钥";
      return;
    }
    try {
      await api("/api/session", { method: "POST", body: JSON.stringify({ key }) });
      $("#admin-key").value = "";
      showApp();
    } catch (error) {
      $("#login-error").textContent = error instanceof Error ? error.message : String(error);
    }
  });

  $("#toggle-key").addEventListener("click", () => {
    const input = $("#admin-key");
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    $("#toggle-key").setAttribute("aria-label", visible ? "显示管理密钥" : "隐藏管理密钥");
  });

  for (const button of $$(".nav-item")) {
    button.addEventListener("click", () => void loadView(button.dataset.view));
  }

  $("#refresh-button").addEventListener("click", () => void loadView(state.view));
  $("#theme-toggle").addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });
  $("#mobile-theme-toggle").addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });
  $("#logout-button").addEventListener("click", async () => {
    await api("/api/session", { method: "DELETE" });
    showLogin();
  });
  $("#mobile-logout-button").addEventListener("click", async () => {
    await api("/api/session", { method: "DELETE" });
    showLogin();
  });

  for (const button of $$("[data-metadata-mode]")) {
    button.addEventListener("click", () => {
      state.metadataMode = button.dataset.metadataMode;
      renderMetadata();
    });
  }
  $("#metadata-provider").addEventListener("change", () => {
    void loadMetadataModels($("#metadata-provider").value).catch((error) =>
      setGlobalError(error.message),
    );
  });
  $("#save-metadata").addEventListener("click", () => {
    void saveMetadata().catch((error) => setGlobalError(error.message));
  });

  $("#role-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("#role-name").value.trim();
    const role = $("#role-access-role").value;
    if (!name) return;
    void createRole(name, role).catch((error) => setGlobalError(error.message));
  });

  $("#roles-list").addEventListener("click", (event) => {
    const regenerate = event.target.closest("[data-role-regenerate]");
    if (regenerate) {
      const rowRole = regenerate.closest(".role-row")?.querySelector("[data-role-value]")?.value;
      const role = rowRole === "admin" ? "admin" : "member";
      $("#role-name").value = regenerate.dataset.roleRegenerate;
      $("#role-access-role").value = role;
      void createRole(regenerate.dataset.roleRegenerate, role).catch((error) =>
        setGlobalError(error.message),
      );
      return;
    }
    const remove = event.target.closest("[data-role-delete]");
    if (remove) {
      void removeRole(remove.dataset.roleDelete, remove.dataset.roleName).catch((error) =>
        setGlobalError(error.message),
      );
    }
  });
  $("#qr-result").addEventListener("click", (event) => {
    const button = event.target.closest("[data-copy-role-url]");
    if (!button) return;
    void navigator.clipboard
      .writeText(button.dataset.copyRoleUrl)
      .then(() => toast("配对链接已复制"))
      .catch((error) => setGlobalError(error.message));
  });

  $("#agent-search").addEventListener("input", renderAgents);
  $("#agent-owner-filter").addEventListener("change", renderAgents);
  $("#sessions-table").addEventListener("click", (event) => {
    const button = event.target.closest("[data-owner-agent]");
    if (!button) return;
    openOwnerDialog(button.dataset.ownerAgent, button.dataset.ownerCurrent);
  });
  $("#owner-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const agentId = $("#owner-dialog").dataset.agentId;
    const name = $("#owner-select").value;
    if (!agentId || !name) return;
    try {
      await transferOwner(agentId, name);
      $("#owner-dialog").close();
    } catch (error) {
      setGlobalError(error.message);
    }
  });
  $("#owner-form [data-close-dialog]").addEventListener("click", () => $("#owner-dialog").close());

  for (const button of $$("[data-days]")) {
    button.addEventListener("click", () => {
      state.teamDays = Number(button.dataset.days);
      for (const item of $$("[data-days]")) item.classList.toggle("active", item === button);
      void loadTeam().catch((error) => setGlobalError(error.message));
    });
  }
  $("#team-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-member]");
    if (!button) return;
    state.activeMemberId = button.dataset.member;
    renderTeam();
  });

  $("#title-search").addEventListener("input", renderTitles);

  $("#admin-key-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void resetAdminKey().catch((error) => setGlobalError(error.message));
  });
  $("#daemon-settings-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.settingsDirty.size === 0) {
      $("#daemon-settings-status").textContent = "没有需要保存的更改";
      return;
    }
    void saveSettings(
      readSettingsForm(),
      $("#daemon-settings-status"),
      $("#retry-common-reload"),
    ).catch((error) => setGlobalError(error.message));
  });
  $("#daemon-settings-form").addEventListener("input", (event) => {
    if (event.target?.dataset?.configPath) state.settingsDirty.add(event.target.dataset.configPath);
  });
  $("#daemon-settings-form").addEventListener("change", (event) => {
    if (event.target?.dataset?.configPath) state.settingsDirty.add(event.target.dataset.configPath);
  });
  $("#save-advanced-config").addEventListener("click", () => {
    let config;
    try {
      config = JSON.parse($("#daemon-config-json").value);
      if (!config || typeof config !== "object" || Array.isArray(config)) {
        throw new Error("配置必须是 JSON 对象");
      }
    } catch (error) {
      setGlobalError(error.message);
      return;
    }
    void saveSettings(config, $("#advanced-settings-status"), $("#retry-advanced-reload")).catch(
      (error) => setGlobalError(error.message),
    );
  });
  $("#retry-common-reload").addEventListener("click", () => {
    void retrySettingsReload($("#daemon-settings-status"), $("#retry-common-reload"));
  });
  $("#retry-advanced-reload").addEventListener("click", () => {
    void retrySettingsReload($("#advanced-settings-status"), $("#retry-advanced-reload"));
  });

  api("/api/session")
    .then((result) => {
      if (result.authenticated) showApp();
      else showLogin();
      return undefined;
    })
    .catch(() => showLogin());
});
