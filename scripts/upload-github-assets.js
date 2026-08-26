const fs = require("fs");
const path = require("path");

const version = require("../package.json").version;
const tag = `v${version}`;
const owner = "Daniel-Ohlayan";
const repo = "AnLaunch";
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const dir = path.join(__dirname, "..", "release");

function filesToUpload() {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^AnLaunch-Setup-.*\.exe$/i.test(f) || f === "latest.yml")
    .map((f) => path.join(dir, f));
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { res, json, text };
}

async function uploadToGithub(files) {
  if (!token) throw new Error("no token");
  let { res, json } = await api(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`);
  if (res.status === 404) {
    ({ res, json } = await api(`https://api.github.com/repos/${owner}/${repo}/releases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tag_name: tag,
        name: `AnLaunch ${version}`,
        draft: false,
        prerelease: false,
        generate_release_notes: false,
        body: `Windows installer: AnLaunch-Setup-${version}.exe`,
      }),
    }));
  }
  if (!res.ok || !json?.id) {
    throw new Error(`GitHub release ${tag}: ${res.status} ${JSON.stringify(json)}`);
  }
  if (json.draft) {
    await api(`https://api.github.com/repos/${owner}/${repo}/releases/${json.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: false, tag_name: tag, make_latest: "true" }),
    });
  }
  const existing = Array.isArray(json.assets) ? json.assets : [];
  for (const filePath of files) {
    const name = path.basename(filePath);
    const prev = existing.find((a) => a.name === name);
    if (prev) {
      await api(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${prev.id}`, { method: "DELETE" });
    }
    const buf = fs.readFileSync(filePath);
    const up = await fetch(
      `https://uploads.github.com/repos/${owner}/${repo}/releases/${json.id}/assets?name=${encodeURIComponent(name)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": name.endsWith(".yml") ? "text/yaml" : "application/octet-stream",
          "Content-Length": String(buf.length),
        },
        body: buf,
      }
    );
    if (!up.ok) throw new Error(`Upload ${name} failed: ${up.status} ${await up.text()}`);
    console.log("uploaded to GitHub", name);
  }
}

async function stashFile(filePath) {
  const name = path.basename(filePath);
  const buf = fs.readFileSync(filePath);
  const blob = new Blob([buf]);

  const attempts = [
    async () => {
      const form = new FormData();
      form.append("file", blob, name);
      const r = await fetch("https://0x0.st", {
        method: "POST",
        headers: { "User-Agent": "anlaunch-ci/1.0" },
        body: form,
      });
      const t = (await r.text()).trim();
      if (!r.ok || !/^https?:\/\//.test(t)) throw new Error(`0x0.st ${r.status} ${t}`);
      return t.split(/\s+/)[0];
    },
    async () => {
      const form = new FormData();
      form.append("reqtype", "fileupload");
      form.append("fileToUpload", blob, name);
      const r = await fetch("https://catbox.moe/user/api.php", { method: "POST", body: form });
      const t = (await r.text()).trim();
      if (!r.ok || !/^https?:\/\//.test(t)) throw new Error(`catbox ${r.status} ${t}`);
      return t;
    },
    async () => {
      const form = new FormData();
      form.append("file", blob, name);
      const r = await fetch("https://file.io/?expires=1d", { method: "POST", body: form });
      const j = await r.json();
      if (!j.link) throw new Error(`file.io ${JSON.stringify(j)}`);
      return j.link;
    },
  ];

  let last = null;
  for (const fn of attempts) {
    try {
      const url = await fn();
      console.log(`stashed ${name} -> ${url}`);
      console.log(`::notice::SETUP_FILE ${name} ${url}`);
      return url;
    } catch (e) {
      last = e;
      console.warn("stash attempt failed:", e.message || e);
    }
  }
  throw last;
}

async function main() {
  const files = filesToUpload();
  if (!files.length) {
    console.error("::error::No AnLaunch-Setup-*.exe or latest.yml in release/");
    process.exit(1);
  }

  try {
    await uploadToGithub(files);
    return;
  } catch (e) {
    console.warn("GitHub upload failed, will stash files:", e.message || e);
  }

  for (const filePath of files) {
    await stashFile(filePath);
  }
}

main().catch((err) => {
  console.error("::error::", err && err.stack ? err.stack : err);
  process.exit(1);
});
