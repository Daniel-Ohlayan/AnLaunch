const fs = require("fs");
const path = require("path");

const version = require("../package.json").version;
const tag = `v${version}`;
const owner = "Daniel-Ohlayan";
const repo = "AnLaunch";
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const dir = path.join(__dirname, "..", "release");

if (!token) {
  console.log("No GH_TOKEN/GITHUB_TOKEN — skip GitHub upload");
  process.exit(0);
}

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

async function main() {
  const files = filesToUpload();
  if (!files.length) {
    console.error("::error::No AnLaunch-Setup-*.exe or latest.yml in release/");
    process.exit(1);
  }

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
    console.error(`::error::Cannot get/create GitHub release ${tag}: ${res.status} ${JSON.stringify(json)}`);
    process.exit(1);
  }

  if (json.draft) {
    const patched = await api(`https://api.github.com/repos/${owner}/${repo}/releases/${json.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: false, tag_name: tag, make_latest: "true" }),
    });
    if (!patched.res.ok) {
      console.warn("Could not undraft release:", patched.res.status, JSON.stringify(patched.json));
    }
  }

  const existing = Array.isArray(json.assets) ? json.assets : [];
  for (const filePath of files) {
    const name = path.basename(filePath);
    const prev = existing.find((a) => a.name === name);
    if (prev) {
      await api(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${prev.id}`, { method: "DELETE" });
    }
    const buf = fs.readFileSync(filePath);
    const uploadUrl = `https://uploads.github.com/repos/${owner}/${repo}/releases/${json.id}/assets?name=${encodeURIComponent(name)}`;
    const up = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": name.endsWith(".yml") ? "text/yaml" : "application/octet-stream",
        "Content-Length": String(buf.length),
      },
      body: buf,
    });
    const upText = await up.text();
    if (!up.ok) {
      console.error(`::error::Upload ${name} failed: ${up.status} ${upText}`);
      process.exit(1);
    }
    console.log("uploaded", name);
  }
}

main().catch((err) => {
  console.error("::error::", err && err.stack ? err.stack : err);
  process.exit(1);
});
