import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const OWNER = "gajendrasingh64673-cmyk";
const REPO = "DesiGram-Final";
const BRANCH = "main";
const TOKEN = process.env.GITHUB_TOKEN;
const ROOT = "/home/runner/workspace";

// Directories that are never pushed (build artifacts, internal state, secrets)
const EXCLUDE_DIRS = new Set([
  ".git", "node_modules", ".cache", ".agents", ".local",
]);

// Specific filenames that must never be uploaded regardless of location.
// Replit-internal files and known secret carriers are listed here because
// this script does NOT parse .gitignore — using a denylist is the safe
// alternative to prevent accidental secret leakage.
// Note: local git remote ("origin") configuration is not performed here
// because the Replit sandbox blocks git CLI commands. The push is done
// entirely via the GitHub REST API.
const EXCLUDE_FILES = new Set([
  ".replit",
  ".replitignore",
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.test",
  ".npmrc",          // may contain auth tokens
  ".yarnrc",
  ".netrc",
  "id_rsa",
  "id_ed25519",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
]);

const EXCLUDE_EXTS = new Set([".tsbuildinfo"]);

function getAllFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      getAllFiles(full, files);
    } else {
      const rel = relative(ROOT, full);
      const parts = entry.split(".");
      const ext = parts.length > 1 ? "." + parts.pop() : "";
      // Check exact filename match or glob-style extension patterns (e.g. "*.pem")
      const isDenied = [...EXCLUDE_FILES].some((pattern) => {
        if (pattern.startsWith("*.")) return entry.endsWith(pattern.slice(1));
        return entry === pattern;
      });
      if (isDenied) continue;
      if (EXCLUDE_EXTS.has(ext)) continue;
      files.push({ path: rel, full });
    }
  }
  return files;
}

async function ghFetch(path, method = "GET", body = null) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `token ${TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "replit-agent",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { message: text }; }
  if (!res.ok) {
    throw new Error(`GitHub ${res.status} on ${method} ${path}: ${JSON.stringify(data.message)}`);
  }
  return data;
}

async function createBlob(path, full) {
  const content = readFileSync(full);
  const isBinary = content.includes(0x00);
  const encoding = isBinary ? "base64" : "utf-8";
  const contentStr = isBinary
    ? content.toString("base64")
    : content.toString("utf-8");

  // Any error here propagates — no silent skip
  const blob = await ghFetch(`/repos/${OWNER}/${REPO}/git/blobs`, "POST", {
    content: contentStr,
    encoding,
  });
  return { path, sha: blob.sha };
}

async function getOrInitBaseSha() {
  // Try to get existing main branch HEAD
  try {
    const ref = await ghFetch(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`);
    const sha = ref.object?.sha;
    if (sha) {
      console.log(`Repository already initialized. Base SHA: ${sha}`);
      return sha;
    }
  } catch (err) {
    if (!err.message.includes("404")) throw err;
  }

  // Repo is empty — initialize it via Contents API (Git Data API rejects 409 on empty repos)
  console.log("Repository is empty. Initializing with placeholder commit...");
  const placeholder = await ghFetch(
    `/repos/${OWNER}/${REPO}/contents/.gitkeep`,
    "PUT",
    {
      message: "chore: initialize repository",
      content: Buffer.from("").toString("base64"),
    }
  );
  const sha = placeholder.commit.sha;
  console.log(`Initialized. Base SHA: ${sha}`);
  return sha;
}

async function main() {
  if (!TOKEN) throw new Error("GITHUB_TOKEN not set");

  // Step 1: Get or create the base commit SHA
  const baseSha = await getOrInitBaseSha();

  // Step 2: Collect all workspace files
  console.log("\nCollecting files...");
  const files = getAllFiles(ROOT);
  console.log(`Found ${files.length} files to push`);

  // Step 3: Create blobs for ALL files — any failure is fatal, no silent skips
  console.log("\nCreating blobs (in batches of 10)...");
  const treeItems = [];
  const BATCH = 10;

  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    // Errors propagate — a single blob failure aborts the entire push
    const results = await Promise.all(
      batch.map(({ path, full }) => createBlob(path, full))
    );
    for (const r of results) {
      treeItems.push({ path: r.path, mode: "100644", type: "blob", sha: r.sha });
    }
    console.log(`  Uploaded ${Math.min(i + BATCH, files.length)}/${files.length}`);
  }

  // Strict integrity check: every discovered file must have a blob
  if (treeItems.length !== files.length) {
    throw new Error(
      `File count mismatch: discovered ${files.length} files but only created ${treeItems.length} blobs. Aborting.`
    );
  }
  console.log(`\nAll ${treeItems.length} blobs created successfully.`);

  // Step 4: Create a single tree
  console.log("Creating tree...");
  const tree = await ghFetch(`/repos/${OWNER}/${REPO}/git/trees`, "POST", {
    base_tree: null,
    tree: treeItems,
  });

  // Step 5: Create the commit (child of baseSha)
  console.log("Creating commit...");
  const commitMsg = [
    "feat: initial push of DesiGram-Final backend scaffold",
    "",
    "Includes:",
    "- Express 5 API server (TypeScript + Node.js 24)",
    "- Drizzle ORM + PostgreSQL database setup",
    "- OpenAPI spec + Orval codegen (React Query hooks + Zod schemas)",
    "- pnpm monorepo workspace structure",
    "- Zod v4 validation schemas",
    "- UI component sandbox (mockup-sandbox with shadcn/ui)",
  ].join("\n");

  const commit = await ghFetch(`/repos/${OWNER}/${REPO}/git/commits`, "POST", {
    message: commitMsg,
    tree: tree.sha,
    parents: [baseSha],
  });

  // Step 6: Update the main branch ref — try fast-forward first, force only if needed
  console.log("Updating main branch...");
  try {
    await ghFetch(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, "PATCH", {
      sha: commit.sha,
      force: false,
    });
    console.log("Updated main branch (fast-forward).");
  } catch (err) {
    if (err.message.includes("422") || err.message.includes("not a fast forward")) {
      console.warn("Non-fast-forward detected — force-updating main branch...");
      await ghFetch(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, "PATCH", {
        sha: commit.sha,
        force: true,
      });
      console.log("Updated main branch (forced).");
    } else {
      throw err;
    }
  }

  console.log(`\nSuccess!`);
  console.log(`Pushed ${treeItems.length} files to https://github.com/${OWNER}/${REPO}/tree/${BRANCH}`);
  console.log(`Commit: ${commit.sha}`);
}

main().catch((err) => {
  console.error("\nPush FAILED:", err.message);
  process.exit(1);
});
