#!/usr/bin/env node
/**
 * Upload the PRISM source tree to GitHub through the REST API.
 * Git is not required; only a GitHub token with repo write access.
 *
 * Usage:
 *   GH_REPO=owner/repo GH_TOKEN=ghp_xxx node tools/upload-github.mjs
 *   GH_REPO=owner/repo GH_TOKEN=ghp_xxx node tools/upload-github.mjs --create --private
 *   node tools/upload-github.mjs --dry-run
 *
 * Options:
 *   --create    create the repository when it does not exist
 *   --private   create it as private (default public)
 *   --branch    target branch (defaults to the repository default branch)
 *   --dry-run   list what would be uploaded, no network calls
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const create = args.includes("--create");
const isPrivate = args.includes("--private");
const branchArg = (() => {
  const i = args.indexOf("--branch");
  return i >= 0 ? args[i + 1] : "";
})();
const repoSpec = process.env.GH_REPO || "";
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";

const SKIP_DIRS = new Set([".git", "release", "node_modules", ".electron-cache", ".tmp"]);
const SKIP_FILES = [/\.log$/i, /^electron-boot\.log$/i, /^\.DS_Store$/i];

function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).split(path.sep).join("/");
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collect(full, out);
    } else if (entry.isFile()) {
      if (SKIP_FILES.some((re) => re.test(entry.name))) continue;
      out.push({ full, rel, size: fs.statSync(full).size });
    }
  }
  return out;
}

function fail(message) {
  console.error("错误：" + message);
  process.exit(1);
}

const files = collect(root).sort((a, b) => a.rel.localeCompare(b.rel));
const total = files.reduce((sum, file) => sum + file.size, 0);
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1) + " MB";

console.log(`待上传文件：${files.length} 个，合计 ${mb(total)}`);
if (dryRun) {
  console.log("\n最大的 10 个文件：");
  files
    .slice()
    .sort((a, b) => b.size - a.size)
    .slice(0, 10)
    .forEach((file) => console.log(`  ${mb(file.size).padStart(8)}  ${file.rel}`));
  const byDir = new Map();
  for (const file of files) {
    const dir = file.rel.includes("/") ? file.rel.split("/")[0] : "(根目录)";
    byDir.set(dir, (byDir.get(dir) || 0) + 1);
  }
  console.log("\n目录分布：");
  [...byDir.entries()].sort().forEach(([dir, count]) => console.log(`  ${dir}: ${count}`));
  console.log("\n--dry-run 完成，未发起任何网络请求。");
  process.exit(0);
}

if (!token) fail("缺少 GH_TOKEN（或 GITHUB_TOKEN）环境变量。");
if (!/^[^/\s]+\/[^/\s]+$/.test(repoSpec)) fail("缺少 GH_REPO，格式应为 owner/repo。");

const [owner, name] = repoSpec.split("/");
const API = "https://api.github.com";

async function api(endpoint, options = {}) {
  const response = await fetch(API + endpoint, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "prism-uploader",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message = data && data.message ? data.message : String(data);
    const error = new Error(`${response.status} ${endpoint}: ${message}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function main() {
  const user = await api("/user");
  console.log(`已认证：${user.login}`);

  let repo = null;
  try {
    repo = await api(`/repos/${owner}/${name}`);
    console.log(`仓库已存在：${repo.html_url}`);
  } catch (error) {
    if (error.status !== 404) throw error;
    if (!create) {
      fail(`仓库 ${owner}/${name} 不存在。确认地址，或加 --create 让脚本创建。`);
    }
    const payload = {
      name,
      private: isPrivate,
      description: "PRISM — a local particle music player",
    };
    repo = owner === user.login
      ? await api("/user/repos", { method: "POST", body: JSON.stringify(payload) })
      : await api(`/orgs/${owner}/repos`, { method: "POST", body: JSON.stringify(payload) });
    console.log(`已创建仓库：${repo.html_url}`);
  }

  const branch = branchArg || repo.default_branch || "main";
  let parentSha = null;
  let baseTree = null;
  try {
    const ref = await api(`/repos/${owner}/${name}/git/ref/heads/${branch}`);
    parentSha = ref.object.sha;
    const parent = await api(`/repos/${owner}/${name}/git/commits/${parentSha}`);
    baseTree = parent.tree.sha;
    console.log(`目标分支 ${branch}，基于 ${parentSha.slice(0, 7)} 提交。`);
  } catch (error) {
    if (error.status !== 404) throw error;
    console.log(`目标分支 ${branch} 为空，将创建首个提交。`);
  }

  let done = 0;
  const entries = new Array(files.length);
  const queue = files.map((file, index) => ({ file, index }));
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const job = queue.shift();
      const content = fs.readFileSync(job.file.full).toString("base64");
      const blob = await api(`/repos/${owner}/${name}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content, encoding: "base64" }),
      });
      entries[job.index] = { path: job.file.rel, mode: "100644", type: "blob", sha: blob.sha };
      done += 1;
      process.stdout.write(`\r已上传 ${done}/${files.length}`);
    }
  });
  await Promise.all(workers);
  process.stdout.write("\n");

  const tree = await api(`/repos/${owner}/${name}/git/trees`, {
    method: "POST",
    body: JSON.stringify(baseTree ? { base_tree: baseTree, tree: entries } : { tree: entries }),
  });

  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const message = `PRISM ${pkg.version} — 3D sphere, particle shapes, Color Hunt palettes, smooth drag swap, queue scroll fix`;
  const commit = await api(`/repos/${owner}/${name}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: parentSha ? [parentSha] : [],
    }),
  });

  if (parentSha) {
    await api(`/repos/${owner}/${name}/git/refs/heads/${branch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
  } else {
    await api(`/repos/${owner}/${name}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    });
  }

  console.log(`完成：${repo.html_url}/commit/${commit.sha}`);
  console.log(`分支：${branch}`);
}

main().catch((error) => {
  console.error("\n上传失败：" + error.message);
  if (error.data && error.data.errors) console.error(JSON.stringify(error.data.errors));
  process.exit(1);
});
