const state = {
  days: 7,
  team: null,
  activeMemberId: null,
};

const $ = (selector) => document.querySelector(selector);

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

function heatLevel(seconds) {
  if (seconds === 0) return 0;
  if (seconds < 180) return 1;
  if (seconds < 420) return 2;
  if (seconds < 780) return 3;
  return 4;
}

async function loadTeam() {
  const end = new Date();
  const start = new Date(end.getTime() - state.days * 86400000);
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const response = await fetch(`/api/team/public?${params}`);
  if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
  state.team = await response.json();
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

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("paseo-admin-theme", theme);
}

document.addEventListener("DOMContentLoaded", () => {
  applyTheme(localStorage.getItem("paseo-admin-theme") === "dark" ? "dark" : "light");
  $("#theme-toggle").addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });
  for (const button of document.querySelectorAll("[data-days]")) {
    button.addEventListener("click", () => {
      state.days = Number(button.dataset.days);
      for (const item of document.querySelectorAll("[data-days]")) {
        item.classList.toggle("active", item === button);
      }
      void loadTeam().catch((error) => {
        $("#team-content").innerHTML =
          `<div class="empty-state">${escapeHtml(error.message)}</div>`;
      });
    });
  }
  $("#team-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-member]");
    if (!button) return;
    state.activeMemberId = button.dataset.member;
    renderTeam();
  });
  void loadTeam().catch((error) => {
    $("#team-content").innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  });
});
