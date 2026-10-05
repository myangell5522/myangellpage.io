const GITHUB_USER = "myangell5522";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const totalEl = document.querySelector("#total-value");
const countEls = {
  steam: document.querySelector('[data-count="steam"]'),
  modrinth: document.querySelector('[data-count="modrinth"]'),
  curseforge: document.querySelector('[data-count="curseforge"]'),
  nexus: document.querySelector('[data-count="nexus"]'),
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
}

function renderDeltas(stats) {
  const base = stats.today?.base;
  const current = {
    total: stats.total ?? 0,
    steam: stats.steam?.downloads ?? 0,
    modrinth: stats.modrinth?.downloads ?? 0,
    curseforge: stats.curseforge?.downloads ?? 0,
    nexus: stats.nexus?.downloads ?? 0,
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
    const total = stats.total ?? steam + modrinth + curseforge + nexus;

    totalEl.classList.add("is-live");
    animateCount(totalEl, total);
    animateCount(countEls.steam, steam);
    animateCount(countEls.modrinth, modrinth);
    animateCount(countEls.curseforge, curseforge);
    animateCount(countEls.nexus, nexus);

    labelCard("card-steam", "Steam", steam, "загрузка", "загрузки", "загрузок");
    labelCard("card-modrinth", "Modrinth", modrinth, "загрузка", "загрузки", "загрузок");
    labelCard("card-curseforge", "CurseForge", curseforge, "загрузка", "загрузки", "загрузок");
    labelCard("card-nexus", "Nexus", nexus, "загрузка", "загрузки", "загрузок");

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

loadStats();
loadContributions();
