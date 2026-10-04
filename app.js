const GITHUB_USER = "myangell5522";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const totalEl = document.querySelector("#total-value");
const countEls = {
  steam: document.querySelector('[data-count="steam"]'),
  modrinth: document.querySelector('[data-count="modrinth"]'),
  curseforge: document.querySelector('[data-count="curseforge"]'),
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

async function loadProfile() {
  const avatar = document.querySelector("#avatar");
  const name = document.querySelector("#name");
  try {
    const response = await fetch(`https://api.github.com/users/${GITHUB_USER}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(String(response.status));
    const user = await response.json();
    avatar.src = user.avatar_url || avatar.src;
    avatar.alt = user.name || user.login || "myangell";
    name.textContent = user.name || user.login || "myangell";
    const link = document.querySelector("#profile-link");
    if (user.html_url) link.href = user.html_url;
    if (user.login) link.textContent = `github.com/${user.login}`;
  } catch {
    avatar.alt = "myangell";
  }
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
    const total = stats.total ?? steam + modrinth + curseforge;

    totalEl.classList.add("is-live");
    animateCount(totalEl, total);
    animateCount(countEls.steam, steam);
    animateCount(countEls.modrinth, modrinth);
    animateCount(countEls.curseforge, curseforge);

    labelCard("card-steam", "Steam", steam, "загрузка", "загрузки", "загрузок");
    labelCard("card-modrinth", "Modrinth", modrinth, "загрузка", "загрузки", "загрузок");
    labelCard("card-curseforge", "CurseForge", curseforge, "загрузка", "загрузки", "загрузок");

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

    renderWorks(stats.projects || stats.steamItems || []);
  } catch {
    updated.textContent = "Не удалось загрузить счётчик";
    const status = document.querySelector("#works-status");
    if (status) status.textContent = "Не удалось загрузить работы";
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

const SOURCE_ICONS = {
  steam: "svg/steam.svg",
  modrinth: "svg/modrinth.svg",
  curseforge: "svg/curseforge.svg",
};

function renderWorks(items) {
  const root = document.querySelector("#works");
  const sorted = items
    .filter((item) => item && item.title && safeHttps(item.url))
    .sort((a, b) => (b.downloads ?? b.subscriptions ?? 0) - (a.downloads ?? a.subscriptions ?? 0));

  if (!sorted.length) {
    root.replaceChildren(statusLine("Нет публичных работ"));
    return;
  }

  root.replaceChildren(
    ...sorted.map((item) => {
      const link = document.createElement("a");
      link.className = "work";
      link.href = safeHttps(item.url);
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      const preview = safeHttps(item.previewUrl);
      if (preview) {
        const image = document.createElement("img");
        image.className = "work__preview";
        image.src = preview;
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        image.addEventListener("error", () => image.remove());
        link.append(image);
      }

      const icon = SOURCE_ICONS[item.source];
      if (icon) {
        const badge = document.createElement("img");
        badge.className = "work__badge";
        badge.src = icon;
        badge.alt = "";
        link.append(badge);
      }

      const title = document.createElement("h3");
      title.textContent = item.title;
      const meta = document.createElement("p");
      const count = Math.max(0, Math.round(item.downloads ?? item.subscriptions ?? 0));
      meta.textContent = `${format(count)} ${plural(count, "загрузка", "загрузки", "загрузок")}`;
      link.append(title, meta);
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

const ACTIVE_REPOS = ["ReimaginingAchievements", "PEAK"];

async function loadActive() {
  const root = document.querySelector("#active");
  const cards = await Promise.all(ACTIVE_REPOS.map(loadActiveRepo));
  root.replaceChildren(...cards);
}

async function loadActiveRepo(name) {
  const pageUrl = `https://github.com/${GITHUB_USER}/${name}`;
  const card = document.createElement("a");
  card.className = "active-card";
  card.href = pageUrl;
  card.target = "_blank";
  card.rel = "noopener noreferrer";

  const title = document.createElement("h3");
  title.textContent = name;
  card.append(title);

  let repo = null;
  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_USER}/${name}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (response.ok) repo = await response.json();
  } catch {
    repo = null;
  }

  if (repo?.name) title.textContent = repo.name;
  if (repo?.description) {
    const description = document.createElement("p");
    description.textContent = repo.description;
    card.append(description);
  }
  if (repo?.language) {
    const language = document.createElement("p");
    language.textContent = repo.language;
    card.append(language);
  }

  const pulse = document.createElement("div");
  pulse.className = "pulse";
  if (!repo) {
    const note = document.createElement("p");
    note.textContent = "Нет публичной активности";
    pulse.append(note);
  } else {
    const weeks = await loadCommitWeeks(name);
    if (!weeks) {
      const note = document.createElement("p");
      note.textContent = "Нет публичной активности";
      pulse.append(note);
    } else {
      const caption = document.createElement("p");
      caption.className = "pulse__caption";
      caption.textContent = "Коммиты за 12 недель";
      pulse.append(caption, renderPulse(weeks));
    }
  }
  card.append(pulse);
  return card;
}

async function loadCommitWeeks(name) {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_USER}/${name}/commits?per_page=100`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!response.ok) return null;
    const commits = await response.json();
    if (!Array.isArray(commits)) return null;

    const start = startOfWeek(new Date());
    start.setUTCDate(start.getUTCDate() - 11 * 7);
    const weeks = Array.from({ length: 12 }, (_, index) => {
      const week = new Date(start);
      week.setUTCDate(start.getUTCDate() + index * 7);
      return { week, count: 0 };
    });

    commits.forEach((commit) => {
      const raw = commit.commit?.author?.date || commit.commit?.committer?.date;
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return;
      const weekTime = startOfWeek(date).getTime();
      const bucket = weeks.find((item) => item.week.getTime() === weekTime);
      if (bucket) bucket.count += 1;
    });
    return weeks;
  } catch {
    return null;
  }
}

function startOfWeek(date) {
  const week = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  week.setUTCDate(week.getUTCDate() - week.getUTCDay());
  return week;
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

loadProfile();
loadStats();
loadContributions();
loadActive();
