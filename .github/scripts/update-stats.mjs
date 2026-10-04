import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sourcesPath = join(root, "data", "sources.json");
const statsPath = join(root, "data", "stats.json");
const UA = "myangellpage (https://github.com/myangell5522)";

const DISCORD_FLAG_BADGES = {
  HOUSE_BRAVERY: {
    label: "HypeSquad Bravery",
    icon: "https://cdn.discordapp.com/badge-icons/8a88d63823d8a71cd5e390baa45efa02.png",
  },
};

const DISCORD_EXTRA_BADGES = [
  {
    label: "Orbs",
    icon: "https://cdn.discordapp.com/assets/content/615334270467aa3d5adc86cc67efee89f8380a87b945a96e89ec2eb37c27993d.png",
  },
  {
    label: "Nitro",
    icon: "https://discord.com/assets/24d05f3b46a110e538674edbac0db4cd.svg",
  },
  {
    label: "Completed a Quest",
    icon: "https://cdn.discordapp.com/badge-icons/7d9ae358c8c5e118768335dbe68b4fb8.png",
  },
];

const sources = JSON.parse(await readFile(sourcesPath, "utf8"));
const previous = await readPrevious();

const [steam, modrinth, curseforge, discord] = await Promise.all([
  fetchSteam(),
  fetchModrinth(),
  fetchCurseforge(),
  fetchDiscord(),
]);

const projects = [...steam.items, ...modrinth.items, ...curseforge.items].sort(
  (a, b) => b.downloads - a.downloads || a.title.localeCompare(b.title, "ru"),
);

const steamItems = steam.items.map((item) => ({
  id: item.id,
  title: item.title,
  subscriptions: item.downloads,
  previewUrl: item.previewUrl,
  url: item.url,
}));

const next = {
  total: steam.downloads + modrinth.downloads + curseforge.downloads,
  steam: { ok: steam.ok, downloads: steam.downloads },
  modrinth: { ok: modrinth.ok, downloads: modrinth.downloads },
  curseforge: { ok: curseforge.ok, downloads: curseforge.downloads },
  projects,
  steamItems,
  discord,
};

if (!steam.ok && !modrinth.ok && !curseforge.ok && !previous) {
  console.error("All sources failed and there is no previous stats.json");
  process.exit(1);
}

if (previous && sameNumbers(previous, next)) {
  console.log("Stats unchanged");
  console.log(summary(previous));
  process.exit(0);
}

next.updatedAt = new Date().toISOString();
await writeFile(statsPath, `${JSON.stringify(next, null, 2)}\n`);
console.log(`Wrote ${statsPath}`);
console.log(summary(next));

function summary(stats) {
  const count = Array.isArray(stats.projects) ? stats.projects.length : 0;
  return `total=${stats.total} steam=${stats.steam.downloads} modrinth=${stats.modrinth.downloads} curseforge=${stats.curseforge.downloads} projects=${count}`;
}

function sameNumbers(left, right) {
  return JSON.stringify(withoutStamp(left)) === JSON.stringify(withoutStamp(right));
}

function withoutStamp(stats) {
  return {
    total: stats.total,
    steam: stats.steam,
    modrinth: stats.modrinth,
    curseforge: stats.curseforge,
    projects: stats.projects,
    steamItems: stats.steamItems,
    discord: stats.discord ?? null,
  };
}

async function readPrevious() {
  try {
    return JSON.parse(await readFile(statsPath, "utf8"));
  } catch {
    return null;
  }
}

function previousProjects(source) {
  const stored = Array.isArray(previous?.projects)
    ? previous.projects
    : Array.isArray(previous?.steamItems)
      ? previous.steamItems
      : [];
  return stored
    .filter((item) => (item.source || "steam") === source)
    .map((item) => ({
      source,
      id: String(item.id),
      title: item.title,
      downloads: Number(item.downloads ?? item.subscriptions) || 0,
      previewUrl: item.previewUrl || "",
      url: item.url,
    }));
}

async function getJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      "User-Agent": UA,
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function getText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent": "Mozilla/5.0 (compatible; myangellpage/1.0; +https://github.com/myangell5522)",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function discoverSteamIds() {
  const ids = new Set((sources.steamFileIds || []).map(String));
  const listed = new Set();
  try {
    for (let page = 1; page <= 10; page += 1) {
      const html = await getText(
        `https://steamcommunity.com/id/myangell/myworkshopfiles/?numperpage=30&p=${page}`,
      );
      const found = [...html.matchAll(/filedetails\/\?id=(\d+)/g)].map((match) => match[1]);
      const fresh = [...new Set(found)].filter((id) => !listed.has(id));
      if (!fresh.length) break;
      fresh.forEach((id) => {
        listed.add(id);
        ids.add(id);
      });
    }
    if (listed.size) console.log(`Steam workshop list: ${listed.size}`);
  } catch (error) {
    console.error(`Steam workshop list failed: ${error.message}`);
  }
  return [...ids];
}

async function fetchSteam() {
  try {
    const ids = await discoverSteamIds();
    const details = [];
    for (let index = 0; index < ids.length; index += 50) {
      const chunk = ids.slice(index, index + 50);
      const body = new URLSearchParams();
      body.set("itemcount", String(chunk.length));
      chunk.forEach((id, itemIndex) => body.set(`publishedfileids[${itemIndex}]`, id));
      const data = await getJson(
        "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        },
      );
      const page = data?.response?.publishedfiledetails;
      if (!Array.isArray(page)) throw new Error("Unexpected Steam payload");
      details.push(...page);
    }

    const missing = details.filter((item) => item.result !== 1);
    if (missing.length) {
      console.log(`Steam skipped ${missing.map((item) => item.publishedfileid).join(", ")}`);
    }

    const items = details
      .filter((item) => item.result === 1)
      .map((item) => ({
        source: "steam",
        id: String(item.publishedfileid),
        title: item.title || String(item.publishedfileid),
        downloads: Number(item.subscriptions) || 0,
        previewUrl: item.preview_url || "",
        url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${item.publishedfileid}`,
      }));

    return {
      ok: true,
      downloads: items.reduce((sum, item) => sum + item.downloads, 0),
      items,
    };
  } catch (error) {
    console.error(`Steam failed: ${error.message}`);
    const items = previousProjects("steam");
    return {
      ok: false,
      downloads: previous?.steam?.downloads ?? items.reduce((sum, item) => sum + item.downloads, 0),
      items,
    };
  }
}

async function fetchModrinth() {
  try {
    const projects = await getJson(
      `https://api.modrinth.com/v2/user/${encodeURIComponent(sources.modrinthUser)}/projects`,
    );
    if (!Array.isArray(projects)) throw new Error("Unexpected Modrinth payload");
    const items = projects.map((project) => ({
      source: "modrinth",
      id: String(project.id),
      title: project.title || project.slug,
      downloads: Number(project.downloads) || 0,
      previewUrl: project.icon_url || "",
      url: `https://modrinth.com/${project.project_type || "project"}/${project.slug}`,
    }));
    return {
      ok: true,
      downloads: items.reduce((sum, item) => sum + item.downloads, 0),
      items,
    };
  } catch (error) {
    console.error(`Modrinth failed: ${error.message}`);
    const items = previousProjects("modrinth");
    return {
      ok: false,
      downloads: previous?.modrinth?.downloads ?? items.reduce((sum, item) => sum + item.downloads, 0),
      items,
    };
  }
}

async function fetchDiscord() {
  const fallback = previous?.discord?.ok ? previous.discord : { ok: false };
  const id = String(sources.discordUserId || "");
  if (!/^\d+$/.test(id)) return fallback;
  try {
    const payload = await getJson(`https://japi.rest/discord/v1/user/${id}`);
    const data = payload?.data;
    if (!data?.id) throw new Error("Unexpected Discord payload");
    const asset = data.avatar_decoration_data?.asset;
    const decoration = /^a?_[A-Za-z0-9]+$/.test(asset || "")
      ? `https://cdn.discordapp.com/avatar-decoration-presets/${asset}.png`
      : "";
    const plate = discordNameplate(data);
    return {
      ok: true,
      id: String(data.id),
      username: data.username || "",
      globalName: data.global_name || data.username || "",
      avatarUrl: discordAvatar(data),
      decorationUrl: decoration,
      badges: discordBadges(data.public_flags_array),
      nameplateVideo: plate.videoUrl,
      nameplateStatic: plate.staticUrl,
    };
  } catch (error) {
    console.error(`Discord profile failed: ${error.message}`);
    return fallback;
  }
}

function discordBadges(flags) {
  const fromFlags = (Array.isArray(flags) ? flags : [])
    .map((flag) => DISCORD_FLAG_BADGES[flag])
    .filter(Boolean);
  const seen = new Set(fromFlags.map((badge) => badge.icon));
  return [...fromFlags, ...DISCORD_EXTRA_BADGES.filter((badge) => !seen.has(badge.icon))];
}

function discordNameplate(data) {
  const asset = data.collectibles?.nameplate?.asset || "";
  if (!/^nameplates\/nameplates_v\d+\/[a-z0-9_]+\/$/.test(asset)) {
    return { videoUrl: "", staticUrl: "" };
  }
  const base = `https://cdn.discordapp.com/assets/collectibles/${asset}`;
  return { videoUrl: `${base}asset.webm`, staticUrl: `${base}static.png` };
}

function discordAvatar(data) {
  if (typeof data.avatarURL === "string" && data.avatarURL.startsWith("https://")) return data.avatarURL;
  if (data.id && data.avatar) {
    return `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png?size=128`;
  }
  return "";
}

async function fetchCurseforge() {
  try {
    const author = await getJson(`https://api.cfwidget.com/author/${sources.curseforgeAuthorId}`);
    const listed = Array.isArray(author?.projects) ? author.projects : [];
    if (!listed.length) throw new Error("CurseForge author has no projects");

    const items = [];
    for (const project of listed) {
      const full = await getJson(`https://api.cfwidget.com/${project.id}`);
      items.push({
        source: "curseforge",
        id: String(full.id || project.id),
        title: full.title || project.name || String(project.id),
        downloads: Number(full?.downloads?.total) || 0,
        previewUrl: full.thumbnail || "",
        url: full.urls?.curseforge || full.urls?.project || "",
      });
    }

    return {
      ok: true,
      downloads: items.reduce((sum, item) => sum + item.downloads, 0),
      items,
    };
  } catch (error) {
    console.error(`CurseForge failed: ${error.message}`);
    const items = previousProjects("curseforge");
    return {
      ok: false,
      downloads: previous?.curseforge?.downloads ?? items.reduce((sum, item) => sum + item.downloads, 0),
      items,
    };
  }
}
