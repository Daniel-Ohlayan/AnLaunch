const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const version = require("../package.json").version;
const tag = `v${version}`;
const owner = "Daniel-Ohlayan";
const repo = "AnLaunch";
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const dir = path.join(__dirname, "..", "release");
const curlBin = process.platform === "win32" ? "curl.exe" : "curl";

function notice(msg) {
  console.log(msg);
  console.log(`::notice::${String(msg).replace(/\r?\n/g, " ").slice(0, 600)}`);
}

function filesToUpload() {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^AnLaunch-Setup-.*\.exe$/i.test(f) || f === "latest.yml")
    .map((f) => path.join(dir, f));
}

function curl(args, extra = {}) {
  return execFileSync(curlBin, args, {
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
    ...extra,
  }).trim();
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
    notice(`uploaded to GitHub ${name}`);
  }
}

function stashFile(filePath) {
  const name = path.basename(filePath);
  const attempts = [
    () => {
      const servers = JSON.parse(curl(["-sS", "https://api.gofile.io/servers"]));
      const server = servers?.data?.servers?.[0]?.name || servers?.data?.server;
      if (!server) throw new Error(JSON.stringify(servers).slice(0, 180));
      const out = curl(["-sS", "-F", `file=@${filePath}`, `https://${server}.gofile.io/contents/uploadfile`]);
      const j = JSON.parse(out);
      const url = j?.data?.directLink || j?.data?.downloadPage || j?.data?.link;
      if (!url) throw new Error(out.slice(0, 180));
      return url;
    },
    () => {
      const out = curl(["-sS", "-T", filePath, `https://oshi.at/${encodeURIComponent(name)}`]);
      const url = out.split(/\s+/).find((x) => /^https?:\/\//.test(x) && !x.includes("oshi.at/tos"));
      if (!url) throw new Error(out.slice(0, 180));
      return url;
    },
    () => {
      const out = curl(["-sS", "-T", filePath, "https://bashupload.com"]);
      const url = out.split(/\s+/).find((x) => /^https?:\/\//.test(x));
      if (!url) throw new Error(out.slice(0, 180));
      return url;
    },
    () => {
      const out = curl([
        "-sS",
        "-F",
        "reqtype=fileupload",
        "-F",
        "time=72h",
        "-F",
        `fileToUpload=@${filePath};filename=${name}.bin`,
        "https://litterbox.catbox.moe/resources/internals/api.php",
      ]);
      if (!/^https?:\/\//.test(out)) throw new Error(out.slice(0, 180));
      return out.split(/\s+/)[0];
    },
  ];

  let last = null;
  for (const fn of attempts) {
    try {
      const url = fn();
      notice(`SETUP_FILE ${name} ${url}`);
      return url;
    } catch (e) {
      last = e;
      notice(`stash fail ${name}: ${e.message || e}`);
    }
  }
  throw last;
}

async function main() {
  const files = filesToUpload();
  notice(`release files: ${files.map((f) => path.basename(f)).join(", ") || "(none)"}`);
  if (!files.length) {
    console.error("::error::No AnLaunch-Setup-*.exe or latest.yml in release/");
    process.exit(1);
  }

  try {
    await uploadToGithub(files);
    return;
  } catch (e) {
    notice(`GitHub upload failed: ${e.message || e}`);
  }

  for (const filePath of files) stashFile(filePath);
}

main().catch((err) => {
  console.error("::error::", err && err.stack ? err.stack : err);
  process.exit(1);
});
