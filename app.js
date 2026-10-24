const GITHUB_USER = "myangell5522";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const totalEl = document.querySelector("#total-value");
const countEls = {
  steam: document.querySelector('[data-count="steam"]'),
  modrinth: document.querySelector('[data-count="modrinth"]'),
  curseforge: document.querySelector('[data-count="curseforge"]'),
  nexus: document.querySelector('[data-count="nexus"]'),
  thirdparty: document.querySelector('[data-count="thirdparty"]'),
};

function format(value) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function plural(value, one, few, many) {
  const n10 = value % 10;
  const n100 = value % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function supportsCssCount() {
  return typeof CSS !== "undefined" && typeof CSS.registerProperty === "function";
}

function animateCount(el, target) {
  const value = Math.max(0, Math.round(Number(target) || 0));
  el.setAttribute("aria-label", format(value));

  if (prefersReducedMotion() || !supportsCssCount()) {
    tween(el, value);
    return;
  }

  el.style.setProperty("--n", "0");
  el.textContent = format(0);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.setProperty("--n", String(value));
      const deadline = performance.now() + 1600;
      const paint = () => {
        const current = Math.round(Number(getComputedStyle(el).getPropertyValue("--n")) || 0);
        const shown = Math.min(current, value);
        el.textContent = format(shown);
        if (shown < value && performance.now() < deadline) requestAnimationFrame(paint);
        else el.textContent = format(value);
      };
      requestAnimationFrame(paint);
    });
  });
}

function tween(el, value) {
  if (prefersReducedMotion()) {
    el.textContent = format(value);
    return;
  }

  const start = performance.now();
  const duration = 1400;
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 4);
    el.textContent = format(Math.round(value * eased));
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function safeHttps(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function renderProfile(user) {
  const avatar = document.querySelector("#avatar");
  const name = document.querySelector("#name");
  const display = user?.name || user?.login || "myangell";
  const src = safeHttps(user?.avatarUrl);
  if (src) avatar.src = src;
  avatar.alt = display;
  name.textContent = display;
  window.siteProfile = { name: display, login: user?.login || GITHUB_USER, avatar: src || avatar.src };
  window.dispatchEvent(new CustomEvent("profile", { detail: window.siteProfile }));
}

function renderDeltas(stats) {
  const base = stats.today?.base;
  const current = {
    total: stats.total ?? 0,
    steam: stats.steam?.downloads ?? 0,
    modrinth: stats.modrinth?.downloads ?? 0,
    curseforge: stats.curseforge?.downloads ?? 0,
    nexus: stats.nexus?.downloads ?? 0,
    thirdparty: stats.thirdparty?.downloads ?? 0,
  };
  document.querySelectorAll("[data-delta]").forEach((el) => {
    const key = el.dataset.delta;
    const diff = base && Number.isFinite(base[key]) ? current[key] - base[key] : 0;
    if (!diff) {
      el.hidden = true;
      return;
    }
    const up = diff > 0;
    el.className = `delta ${key === "total" ? "delta--total " : ""}${up ? "delta--up" : "delta--down"}`;
    el.textContent = `${up ? "▲" : "▼"} ${up ? "+" : "−"}${format(Math.abs(diff))}`;
    el.title = `За сегодня: ${up ? "+" : "−"}${format(Math.abs(diff))}`;
    el.hidden = false;
  });
}

async function loadStats() {
  const updated = document.querySelector("#updated");
  try {
    const response = await fetch("./data/stats.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(String(response.status));
    const stats = await response.json();
    const steam = stats.steam?.downloads ?? 0;
    const modrinth = stats.modrinth?.downloads ?? 0;
    const curseforge = stats.curseforge?.downloads ?? 0;
    const nexus = stats.nexus?.downloads ?? 0;
    const thirdparty = stats.thirdparty?.downloads ?? 0;
    const total = stats.total ?? steam + modrinth + curseforge + nexus + thirdparty;
    setupThirdParty(stats);

    totalEl.classList.add("is-live");
    animateCount(totalEl, total);
    animateCount(countEls.steam, steam);
    animateCount(countEls.modrinth, modrinth);
    animateCount(countEls.curseforge, curseforge);
    animateCount(countEls.nexus, nexus);
    if (stats.thirdparty) animateCount(countEls.thirdparty, thirdparty);

    labelCard("card-steam", "Steam", steam, "загрузка", "загрузки", "загрузок");
    labelCard("card-modrinth", "Modrinth", modrinth, "загрузка", "загрузки", "загрузок");
    labelCard("card-curseforge", "CurseForge", curseforge, "загрузка", "загрузки", "загрузок");
    labelCard("card-nexus", "Nexus", nexus, "загрузка", "загрузки", "загрузок");
    labelCard("card-thirdparty", stats.thirdparty?.label || "Third-Party", thirdparty, "загрузка", "загрузки", "загрузок");

    if (stats.updatedAt) {
      const when = new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Europe/Moscow",
      }).format(new Date(stats.updatedAt));
      updated.textContent = `Обновлено ${when} МСК`;
    } else {
      updated.textContent = "";
    }

    renderDeltas(stats);
    renderShares({ steam, modrinth, curseforge, nexus, thirdparty }, total);
    renderTrend(stats);
    celebrate(stats);
    renderProfile(stats.github);
    renderWorks(stats.projects || stats.steamItems || []);
    renderDiscord(stats.discord);
    renderActive(stats.active);
  } catch {
    updated.textContent = "Не удалось загрузить счётчик";
    const status = document.querySelector("#works-status");
    if (status) status.textContent = "Не удалось загрузить работы";
    renderActive([]);
  }
}

function labelCard(id, brand, value, one, few, many) {
  const card = document.getElementById(id);
  if (!card) return;
  card.setAttribute(
    "aria-label",
    `${brand}, ${format(value)} ${plural(value, one, few, many)}`,
  );
}

function renderDiscord(profile) {
  const root = document.querySelector("#discord-preview");
  if (!root) return;
  if (!profile?.ok || !profile.globalName) {
    root.hidden = true;
    root.replaceChildren();
    return;
  }

  const avatarWrap = document.createElement("span");
  avatarWrap.className = "discord-avatar";
  const photo = document.createElement("img");
  photo.className = "discord-avatar__img";
  photo.alt = "";
  photo.src = safeHttps(profile.avatarUrl);
  avatarWrap.append(photo);
  const decoration = safeHttps(profile.decorationUrl);
  if (decoration) {
    const deco = document.createElement("img");
    deco.className = "discord-avatar__deco";
    deco.alt = "";
    deco.src = decoration;
    avatarWrap.append(deco);
  }

  const layers = [];
  const still = safeHttps(profile.nameplateStatic);
  const videoUrl = safeHttps(profile.nameplateVideo);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduced && videoUrl) {
    const video = document.createElement("video");
    video.className = "discord-plate__media";
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    if (still) video.poster = still;
    const source = document.createElement("source");
    source.src = videoUrl;
    source.type = "video/webm";
    video.append(source);
    layers.push(video);
  } else if (still) {
    const frame = document.createElement("img");
    frame.className = "discord-plate__media";
    frame.alt = "";
    frame.src = still;
    layers.push(frame);
  }

  const text = document.createElement("span");
  text.className = "discord-preview__text";
  const name = document.createElement("span");
  name.className = "discord-preview__name";
  name.textContent = profile.globalName;
  text.append(name);

  const meta = document.createElement("span");
  meta.className = "discord-preview__meta";
  const user = document.createElement("span");
  user.className = "discord-preview__user";
  user.textContent = profile.username || "";
  meta.append(user);
  const badges = document.createElement("span");
  badges.className = "discord-badges";
  for (const badge of profile.badges || []) {
    const icon = discordBadge(badge);
    if (icon) badges.append(icon);
  }
  if (badges.childElementCount) meta.append(badges);
  text.append(meta);

  root.replaceChildren(...layers, avatarWrap, text);
  root.hidden = false;
}

function discordBadge(badge) {
  const icon = safeHttps(badge?.icon);
  if (!icon) return null;
  const image = document.createElement("img");
  image.className = "discord-badge";
  image.alt = badge.label || "";
  image.title = badge.label || "";
  image.src = icon;
  image.addEventListener("error", () => image.remove());
  return image;
}

const SOURCE_ICONS = {
  steam: "svg/steam.svg",
  modrinth: "svg/modrinth.svg",
  curseforge: "svg/curseforge.svg",
  nexus: "svg/nexus.svg",
  thirdparty: "svg/thirdparty.svg",
};

// Fifth counter: mods from other sites listed in data/third-party.json.
function setupThirdParty(stats) {
  const card = document.getElementById("card-thirdparty");
  const info = stats.thirdparty;
  const items = (stats.projects || []).filter((item) => item?.source === "thirdparty");
  const note = document.getElementById("sum-note");
  document.querySelector(".cards")?.classList.toggle("cards--five", Boolean(info));
  if (!card || !info) return;
  const label = info.label || "Third-Party";
  card.querySelector('[data-label="thirdparty"]').textContent = label;
  const sites = [...new Set(items.map((item) => item.site).filter(Boolean))];
  card.querySelector('[data-hint="thirdparty"]').textContent = sites.length ? sites.join(", ") : "загрузки модов";
  if (items.length === 1 && safeHttps(items[0].url)) {
    card.href = items[0].url;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
  }
  card.hidden = false;
  if (note) note.textContent = `В сумме Steam, Modrinth, CurseForge, Nexus Mods и ${sites.length ? sites.join(", ") : label}.`;
}

function renderWorks(items) {
  const root = document.querySelector("#works");
  const sorted = items
    .filter((item) => item && item.title && safeHttps(item.url))
    .sort((a, b) => (b.downloads ?? b.subscriptions ?? 0) - (a.downloads ?? a.subscriptions ?? 0));

  if (!sorted.length) {
    root.replaceChildren(statusLine("Нет публичных работ"));
    return;
  }

  const counter = document.querySelector("#works-count");
  if (counter) counter.textContent = `${format(sorted.length)} ${plural(sorted.length, "работа", "работы", "работ")}`;

  root.replaceChildren(
    ...sorted.map((item, index) => {
      const link = document.createElement("a");
      link.className = "work";
      link.href = safeHttps(item.url);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.style.setProperty("--i", String(Math.min(index, 14)));
      if (item.source) link.dataset.source = item.source;

      const media = document.createElement("div");
      media.className = "work__media";
      const preview = safeHttps(item.previewUrl);
      if (preview) {
        const image = document.createElement("img");
        image.className = "work__preview";
        image.src = preview;
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        image.addEventListener("error", () => image.remove());
        media.append(image);
      }
      link.append(media);

      if (index < 3) {
        const rank = document.createElement("span");
        rank.className = `work__rank work__rank--${index + 1}`;
        rank.textContent = `#${index + 1}`;
        rank.title = `Топ-${index + 1} по загрузкам`;
        link.append(rank);
      }

      const icon = SOURCE_ICONS[item.source];
      if (icon) {
        const badge = document.createElement("img");
        badge.className = "work__badge";
        badge.src = icon;
        badge.alt = "";
        if (item.site) badge.title = item.site;
        link.append(badge);
      }

      const title = document.createElement("h3");
      title.textContent = item.title;
      const meta = document.createElement("p");
      const count = Math.max(0, Math.round(item.downloads ?? item.subscriptions ?? 0));
      const strong = document.createElement("b");
      strong.textContent = format(count);
      meta.append(strong, ` ${plural(count, "загрузка", "загрузки", "загрузок")}`);
      link.append(title, meta);
      attachTilt(link, 6);
      return link;
    }),
  );
}

function statusLine(text) {
  const line = document.createElement("p");
  line.className = "muted";
  line.textContent = text;
  return line;
}

async function loadContributions() {
  const heading = document.querySelector("#contrib-total");
  try {
    const response = await fetch(
      `https://github-contributions-api.jogruber.de/v4/${GITHUB_USER}?y=last`,
    );
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    const days = Array.isArray(data.contributions) ? data.contributions.slice() : [];
    days.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (!days.length) throw new Error("empty");

    const total = data.total?.lastYear ?? days.reduce((sum, day) => sum + (day.count || 0), 0);
    heading.textContent = `${format(total)} ${plural(total, "вклад", "вклада", "вкладов")} за последний год`;
    renderGraph(days);
  } catch {
    heading.textContent = "Не удалось загрузить граф";
  }
}

function renderGraph(days) {
  const months = document.querySelector("#months");
  const grid = document.querySelector("#grid");
  const first = new Date(`${days[0].date}T00:00:00Z`);
  const cells = Array(first.getUTCDay()).fill(null).concat(days);
  while (cells.length % 7) cells.push(null);

  const weeks = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  const monthNodes = [];
  const dayNodes = [];
  let previousMonth = -1;
  let lastLabelIndex = -4;

  weeks.forEach((week, index) => {
    const dated = week.filter(Boolean);
    const firstOfMonth = dated.find((day) => new Date(`${day.date}T00:00:00Z`).getUTCDate() === 1);
    const sample = firstOfMonth || (index === 0 ? dated[0] : null);
    const label = document.createElement("span");
    if (sample) {
      const month = new Date(`${sample.date}T00:00:00Z`).getUTCMonth();
      if (month !== previousMonth && index - lastLabelIndex >= 2) {
        label.textContent = MONTHS[month];
        lastLabelIndex = index;
      }
      previousMonth = month;
    }
    monthNodes.push(label);

    week.forEach((day) => {
      const cell = document.createElement("span");
      cell.className = "day";
      cell.style.setProperty("--w", String(index));
      if (!day) {
        cell.classList.add("day--empty");
        cell.setAttribute("aria-hidden", "true");
      } else {
        const level = Math.max(0, Math.min(4, Number(day.level) || 0));
        cell.classList.add(`day--l${level}`);
        cell.title = tooltip(day);
      }
      dayNodes.push(cell);
    });
  });

  months.replaceChildren(...monthNodes);
  grid.replaceChildren(...dayNodes);
}

function tooltip(day) {
  const date = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day.date}T00:00:00Z`));
  const count = day.count || 0;
  if (!count) return `${date}: нет вкладов`;
  return `${date}: ${format(count)} ${plural(count, "вклад", "вклада", "вкладов")}`;
}

function renderActive(repos) {
  const root = document.querySelector("#active");
  const list = Array.isArray(repos) ? repos.filter((repo) => repo?.name) : [];
  if (!list.length) {
    root.replaceChildren(statusLine("Нет данных о репозиториях"));
    return;
  }
  root.replaceChildren(...list.map(activeCard));
}

function activeCard(repo) {
  const card = document.createElement("a");
  card.className = "active-card";
  card.href = safeHttps(repo.url) || `https://github.com/${GITHUB_USER}/${encodeURIComponent(repo.name)}`;
  card.target = "_blank";
  card.rel = "noopener noreferrer";

  const title = document.createElement("h3");
  title.textContent = repo.name;
  card.append(title);

  if (repo.description) {
    const description = document.createElement("p");
    description.textContent = repo.description;
    card.append(description);
  }
  if (repo.language) {
    const language = document.createElement("p");
    language.className = "active-card__lang";
    language.textContent = repo.language;
    card.append(language);
  }

  const pulse = document.createElement("div");
  pulse.className = "pulse";
  const weeks = Array.isArray(repo.weeks)
    ? repo.weeks
        .map((item) => ({ week: new Date(`${item.week}T00:00:00Z`), count: Number(item.count) || 0 }))
        .filter((item) => !Number.isNaN(item.week.getTime()))
    : [];
  if (repo.hidden || !weeks.length) {
    const note = document.createElement("p");
    note.textContent = repo.hidden
      ? "Скрытый репозиторий. Нет публичной активности"
      : "Нет публичной активности";
    pulse.append(note);
  } else {
    const caption = document.createElement("p");
    caption.className = "pulse__caption";
    caption.textContent = "Коммиты за 12 недель";
    pulse.append(caption, renderPulse(weeks));
  }
  card.append(pulse);
  return card;
}

function renderPulse(weeks) {
  const bars = document.createElement("div");
  bars.className = "pulse__bars";
  bars.setAttribute("role", "img");
  bars.setAttribute("aria-label", "Активность за 12 недель");
  const max = Math.max(1, ...weeks.map((week) => week.count));
  let lastActive = -1;
  weeks.forEach((week, index) => {
    if (week.count > 0) lastActive = index;
  });

  weeks.forEach((week, index) => {
    const bar = document.createElement("span");
    bar.style.setProperty("--i", String(index));
    const level = week.count === 0 ? 0 : Math.min(4, Math.ceil((week.count / max) * 4));
    bar.className = `pulse__bar day--l${level}`;
    if (index === lastActive) bar.classList.add("pulse__bar--live");
    bar.style.height = week.count === 0 ? "4px" : `${Math.max(10, Math.round((week.count / max) * 36))}px`;
    const label = new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(week.week);
    bar.title = week.count
      ? `${label}: ${format(week.count)} ${plural(week.count, "коммит", "коммита", "коммитов")}`
      : `${label}: нет коммитов`;
    bars.append(bar);
  });
  return bars;
}

/* ---------- Extras: shares, trend, celebration ---------- */

function renderShares(values, total) {
  const sum = Math.max(1, total);
  for (const [key, value] of Object.entries(values)) {
    const fill = document.querySelector(`[data-share="${key}"]`);
    if (!fill) continue;
    const pct = (value / sum) * 100;
    requestAnimationFrame(() => {
      fill.style.width = `${Math.max(value > 0 ? 2 : 0, pct).toFixed(1)}%`;
    });
    fill.parentElement.title = `${pct.toFixed(1)}% от всех загрузок`;
  }
}

function renderTrend(stats) {
  const box = document.querySelector("#trend");
  const svg = document.querySelector("#trend-chart");
  const tip = document.querySelector("#trend-tip");
  const sumEl = document.querySelector("#trend-sum");
  if (!box || !svg) return;

  const history = Array.isArray(stats.history)
    ? stats.history.filter((entry) => entry?.date && Number.isFinite(entry.total))
    : [];
  const days = [];
  for (let i = 1; i < history.length; i += 1) {
    days.push({ date: history[i].date, gain: Math.max(0, history[i].total - history[i - 1].total) });
  }
  // Fallback before history accumulates: show today's gain from the daily base.
  if (!days.length && stats.today?.base && Number.isFinite(stats.today.base.total)) {
    days.push({ date: stats.today.date, gain: Math.max(0, (stats.total ?? 0) - stats.today.base.total) });
  }
  const recent = days.slice(-14);
  if (!recent.length) return;

  const NS = "http://www.w3.org/2000/svg";
  const W = 240;
  const H = 64;
  const slots = 14;
  const gap = 4;
  const barW = (W - gap * (slots - 1)) / slots;
  const max = Math.max(1, ...recent.map((day) => day.gain));
  const defs = document.createElementNS(NS, "defs");
  defs.innerHTML = `
    <linearGradient id="trend-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2ee6c5"/><stop offset="1" stop-color="#26a641" stop-opacity="0.55"/>
    </linearGradient>
    <linearGradient id="trend-grad-hot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b6ffcb"/><stop offset="1" stop-color="#39d353"/>
    </linearGradient>`;
  const nodes = [defs];
  const offset = slots - recent.length;
  recent.forEach((day, index) => {
    const h = day.gain === 0 ? 2 : Math.max(4, (day.gain / max) * H);
    const rect = document.createElementNS(NS, "rect");
    const x = (offset + index) * (barW + gap);
    rect.setAttribute("x", x.toFixed(2));
    rect.setAttribute("y", (H - h).toFixed(2));
    rect.setAttribute("width", barW.toFixed(2));
    rect.setAttribute("height", h.toFixed(2));
    rect.setAttribute("rx", "2.5");
    rect.setAttribute("class", `bar${index === recent.length - 1 ? " bar--today" : ""}`);
    rect.style.animationDelay = `${0.5 + index * 0.05}s`;
    const label = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" })
      .format(new Date(`${day.date}T12:00:00Z`));
    const text = `${label}: +${format(day.gain)}`;
    rect.addEventListener("mouseenter", () => {
      if (!tip) return;
      tip.textContent = text;
      tip.hidden = false;
      const boxRect = box.getBoundingClientRect();
      const r = rect.getBoundingClientRect();
      tip.style.left = `${r.left - boxRect.left + r.width / 2}px`;
      tip.style.bottom = `${boxRect.bottom - r.top + 6}px`;
    });
    rect.addEventListener("mouseleave", () => { if (tip) tip.hidden = true; });
    const title = document.createElementNS(NS, "title");
    title.textContent = text;
    rect.append(title);
    nodes.push(rect);
  });
  svg.replaceChildren(...nodes);
  const sum = recent.reduce((acc, day) => acc + day.gain, 0);
  sumEl.textContent = `+${format(sum)} за ${recent.length} ${plural(recent.length, "день", "дня", "дней")}`;
  box.hidden = false;
}

function celebrate(stats) {
  const base = stats.today?.base?.total;
  if (!Number.isFinite(base) || (stats.total ?? 0) <= base || prefersReducedMotion()) return;
  const host = document.querySelector(".total");
  if (!host) return;
  const colors = ["#39d353", "#2ee6c5", "#a371f7", "#ff7ab8", "#ffe58a"];
  setTimeout(() => {
    const badge = host.querySelector(".delta--total");
    const hostRect = host.getBoundingClientRect();
    const r = badge && !badge.hidden ? badge.getBoundingClientRect() : hostRect;
    const ox = r.left - hostRect.left + r.width / 2;
    const oy = r.top - hostRect.top + r.height / 2;
    for (let i = 0; i < 26; i += 1) {
      const piece = document.createElement("span");
      piece.className = "burst";
      piece.style.left = `${ox}px`;
      piece.style.top = `${oy}px`;
      piece.style.background = colors[i % colors.length];
      host.append(piece);
      const angle = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 70;
      piece.animate(
        [
          { transform: "translate(-50%, -50%) scale(1) rotate(0deg)", opacity: 1 },
          {
            transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist + 30}px)) scale(0.3) rotate(${Math.random() * 540}deg)`,
            opacity: 0,
          },
        ],
        { duration: 900 + Math.random() * 500, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      ).onfinish = () => piece.remove();
    }
  }, 1500);
}

/* ---------- Effects: reveal, tilt + spotlight, starfield ---------- */

function setupReveal() {
  const items = document.querySelectorAll(".reveal");
  items.forEach((el, index) => el.style.setProperty("--d", `${Math.min(index, 8) * 0.06}s`));
  if (!("IntersectionObserver" in window) || prefersReducedMotion()) {
    items.forEach((el) => el.classList.add("is-in"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.08 },
  );
  items.forEach((el) => observer.observe(el));
}

const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

function attachTilt(el, strength = 8) {
  if (!finePointer || prefersReducedMotion()) return;
  let frame = 0;
  el.addEventListener("pointermove", (event) => {
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
      el.style.transform = `perspective(700px) rotateX(${((0.5 - y) * strength).toFixed(2)}deg) rotateY(${((x - 0.5) * strength).toFixed(2)}deg) translateY(-2px)`;
    });
  });
  el.addEventListener("pointerleave", () => {
    cancelAnimationFrame(frame);
    el.style.transform = "";
  });
}

function setupSky() {
  const canvas = document.querySelector("#sky");
  if (!canvas || prefersReducedMotion()) return;
  const ctx = canvas.getContext("2d");
  const palette = ["57,211,83", "46,230,197", "163,113,247", "240,246,252"];
  let width = 0;
  let height = 0;
  let stars = [];
  let mouseX = 0.5;
  let mouseY = 0.5;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(140, (width * height) / 11000));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      z: 0.2 + Math.random() * 0.8,
      r: 0.4 + Math.random() * 1.3,
      c: palette[Math.floor(Math.random() * (Math.random() < 0.6 ? 1 : palette.length))],
      t: Math.random() * Math.PI * 2,
      vy: -(0.04 + Math.random() * 0.16),
    }));
  }

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", (event) => {
    mouseX = event.clientX / Math.max(1, width);
    mouseY = event.clientY / Math.max(1, height);
  });

  let running = true;
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) requestAnimationFrame(draw);
  });

  function draw(now) {
    if (!running) return;
    ctx.clearRect(0, 0, width, height);
    const px = (mouseX - 0.5) * 30;
    const py = (mouseY - 0.5) * 30;
    for (const star of stars) {
      star.y += star.vy * star.z;
      if (star.y < -10) {
        star.y = height + 10;
        star.x = Math.random() * width;
      }
      const twinkle = 0.45 + 0.55 * Math.sin(now / 900 + star.t);
      const x = star.x + px * star.z;
      const y = star.y + py * star.z;
      ctx.beginPath();
      ctx.fillStyle = `rgba(${star.c},${(0.15 + 0.6 * twinkle * star.z).toFixed(3)})`;
      ctx.arc(x, y, star.r * star.z + 0.2, 0, Math.PI * 2);
      ctx.fill();
      if (star.r > 1.4 && star.z > 0.7) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(${star.c},${(0.08 * twinkle).toFixed(3)})`;
        ctx.arc(x, y, star.r * 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    requestAnimationFrame(draw);
  }

  resize();
  requestAnimationFrame(draw);
}

/* ---------- GitHub profile widget (generated in the myangell5522 repo) ---------- */

// The profile repo regenerates its widget SVG every 30 minutes. The page uses the
// site-colored copy if it exists; otherwise it takes the gold card and swaps its
// palette here. raw.githubusercontent serves SVG as text, so it's shown through a blob URL.
const WIDGET_BASE = "https://raw.githubusercontent.com/myangell5522/myangell5522/main/widgets/";
const WIDGET_SOURCES = [
  { url: `${WIDGET_BASE}profile-card-portfolio.svg`, recolor: false },
  { url: `${WIDGET_BASE}profile-card.svg`, recolor: true },
  { url: "https://cdn.jsdelivr.net/gh/myangell5522/myangell5522@main/widgets/profile-card.svg", recolor: true },
];
// Gold palette (GitHub profile) → portfolio palette.
const WIDGET_PALETTE = {
  "#E8B84A": "#39D353",
  "#F7D37A": "#5FF2C8",
  "#F0C85A": "#5FF2C8",
  "#FFF6E4": "#EAFBF0",
  "#1A1408": "#07130A",
  "#EEF2F8": "#F0F6FC",
  "#8D96A8": "#8B949E",
  "#5B6375": "#5B6472",
  "#14110B": "#0B1411",
  "#16120C": "#0B1411",
  "#0A0E1A": "#07090D",
  "#0B1020": "#07090D",
  "#2A2418": "#14231A",
};

function recolorWidget(svg) {
  const pattern = new RegExp(Object.keys(WIDGET_PALETTE).join("|"), "gi");
  return svg.replace(pattern, (hex) => WIDGET_PALETTE[hex.toUpperCase()] || hex);
}

async function loadProfileWidget() {
  const section = document.querySelector("#gh-widget");
  const img = document.querySelector("#gh-widget-img");
  if (!section || !img) return;
  const frame = img.parentElement;
  const show = (src) =>
    new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = src;
    });

  for (const source of WIDGET_SOURCES) {
    try {
      const res = await fetch(`${source.url}?t=${Math.floor(Date.now() / 600000)}`, { cache: "no-cache" });
      if (!res.ok) continue;
      let text = await res.text();
      if (!text.includes("<svg")) continue;
      if (source.recolor) text = recolorWidget(text);
      await show(URL.createObjectURL(new Blob([text], { type: "image/svg+xml" })));
      img.hidden = false;
      frame.classList.remove("is-loading");
      return;
    } catch {
      /* try the next source */
    }
  }
  section.hidden = true;
}

document.querySelectorAll(".card").forEach((card) => attachTilt(card, 7));
loadProfileWidget();
setupReveal();
setupSky();
loadStats();
loadContributions();
