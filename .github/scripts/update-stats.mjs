import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sourcesPath = join(root, "data", "sources.json");
const statsPath = join(root, "data", "stats.json");
const UA = "myangellpage (https://github.com/myangell5522)";

const sources = JSON.parse(await readFile(sourcesPath, "utf8"));
const previous = await readPrevious();

const [steam, modrinth, curseforge] = await Promise.all([
  fetchSteam(),
  fetchModrinth(),
  fetchCurseforge(),
]);

const next = {
  total: steam.downloads + modrinth.downloads + curseforge.downloads,
  steam: { ok: steam.ok, downloads: steam.downloads },
  modrinth: { ok: modrinth.ok, downloads: modrinth.downloads },
  curseforge: { ok: curseforge.ok, downloads: curseforge.downloads },
  steamItems: steam.items,
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
  return `total=${stats.total} steam=${stats.steam.downloads} modrinth=${stats.modrinth.downloads} curseforge=${stats.curseforge.downloads}`;
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
    steamItems: stats.steamItems,
  };
}

async function readPrevious() {
  try {
    return JSON.parse(await readFile(statsPath, "utf8"));
  } catch {
    return null;
  }
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
  if (!response.ok) {
    throw new Error(`${response.status} ${url}`);
  }
  return response.json();
}

async function fetchSteam() {
  try {
    const ids = sources.steamFileIds.map(String);
    const body = new URLSearchParams();
    body.set("itemcount", String(ids.length));
    ids.forEach((id, index) => body.set(`publishedfileids[${index}]`, id));

    const data = await getJson(
      "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
    );

    const details = data?.response?.publishedfiledetails;
    if (!Array.isArray(details)) throw new Error("Unexpected Steam payload");

    const missing = details.filter((item) => item.result !== 1);
    if (missing.length) {
      console.log(`Steam skipped ${missing.map((item) => item.publishedfileid).join(", ")}`);
    }

    const items = details
      .filter((item) => item.result === 1)
      .map((item) => ({
        id: String(item.publishedfileid),
        title: item.title || String(item.publishedfileid),
        subscriptions: Number(item.subscriptions) || 0,
        previewUrl: item.preview_url || "",
        url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${item.publishedfileid}`,
      }))
      .sort((a, b) => b.subscriptions - a.subscriptions || a.id.localeCompare(b.id));

    return {
      ok: true,
      downloads: items.reduce((sum, item) => sum + item.subscriptions, 0),
      items,
    };
  } catch (error) {
    console.error(`Steam failed: ${error.message}`);
    return keepSteam();
  }
}

function keepSteam() {
  return {
    ok: false,
    downloads: previous?.steam?.downloads ?? 0,
    items: previous?.steamItems ?? [],
  };
}

async function fetchModrinth() {
  try {
    const projects = await getJson(
      `https://api.modrinth.com/v2/user/${encodeURIComponent(sources.modrinthUser)}/projects`,
    );
    if (!Array.isArray(projects)) throw new Error("Unexpected Modrinth payload");
    return {
      ok: true,
      downloads: projects.reduce((sum, project) => sum + (Number(project.downloads) || 0), 0),
    };
  } catch (error) {
    console.error(`Modrinth failed: ${error.message}`);
    return { ok: false, downloads: previous?.modrinth?.downloads ?? 0 };
  }
}

async function fetchCurseforge() {
  try {
    const author = await getJson(`https://api.cfwidget.com/author/${sources.curseforgeAuthorId}`);
    const listed = Array.isArray(author?.projects) ? author.projects : [];
    if (!listed.length) throw new Error("CurseForge author has no projects");

    const projects = [];
    for (const project of listed) {
      const full = await getJson(`https://api.cfwidget.com/${project.id}`);
      projects.push(Number(full?.downloads?.total) || 0);
    }

    return {
      ok: true,
      downloads: projects.reduce((sum, value) => sum + value, 0),
    };
  } catch (error) {
    console.error(`CurseForge failed: ${error.message}`);
    return { ok: false, downloads: previous?.curseforge?.downloads ?? 0 };
  }
}
