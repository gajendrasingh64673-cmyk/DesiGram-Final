import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const OWNER = "gajendrasingh64673-cmyk";
const REPO = "DesiGram-Final";
const BRANCH = "main";
const TOKEN = process.env.GITHUB_TOKEN;
const ROOT = "/home/runner/workspace";

const EXCLUDE_DIRS = new Set([
  ".git", "node_modules", ".cache", ".agents", ".local",
]);
const EXCLUDE_FILES = new Set([".replit", ".replitignore"]);
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
      if (EXCLUDE_FILES.has(entry)) continue;
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
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`GitHub ${res.status} on ${method} ${path}: ${JSON.stringify(data.message)}`);
  }
  return data;
}

async function main() {
  if (!TOKEN) throw new Error("GITHUB_TOKEN not set");

  // Step 1: Initialize the empty repo by creating a placeholder file via Contents API
  console.log("Initializing empty repository with placeholder commit...");
  const placeholder = await ghFetch(`/repos/${OWNER}/${REPO}/contents/.gitkeep`, "PUT", {
    message: "chore: initialize repository",
    content: Buffer.from("").toString("base64"),
  });
  const baseSha = placeholder.commit.sha;
  console.log(`Base commit SHA: ${baseSha}`);

  // Step 2: Collect all workspace files
  console.log("\nCollecting files...");
  const files = getAllFiles(ROOT);
  console.log(`Found ${files.length} files to push`);

  // Step 3: Create blobs for all files
  console.log("\nCreating blobs (in batches of 10)...");
  const treeItems = [];
  const BATCH = 10;

  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async ({ path, full }) => {
        try {
          const content = readFileSync(full);
          // Detect binary: check for null bytes
          const isBinary = content.includes(0x00);
          const encoding = isBinary ? "base64" : "utf-8";
          const contentStr = isBinary
            ? content.toString("base64")
            : content.toString("utf-8");

          const blob = await ghFetch(`/repos/${OWNER}/${REPO}/git/blobs`, "POST", {
            content: contentStr,
            encoding,
          });
          return { path, sha: blob.sha };
        } catch (err) {
          console.error(`  Skipping ${path}: ${err.message}`);
          return null;
        }
      })
    );
    for (const r of results) {
      if (r) {
        treeItems.push({ path: r.path, mode: "100644", type: "blob", sha: r.sha });
      }
    }
    console.log(`  Processed ${Math.min(i + BATCH, files.length)}/${files.length}`);
  }

  // Remove the .gitkeep placeholder from the tree (we don't want it)
  // It's not in our file list so it won't be in treeItems

  console.log(`\nCreating tree with ${treeItems.length} items...`);
  const tree = await ghFetch(`/repos/${OWNER}/${REPO}/git/trees`, "POST", {
    base_tree: null,  // fresh tree (we'll replace via force)
    tree: treeItems,
  });

  console.log("Creating commit...");
  const commitMsg = [
    "feat: initial push of DesiGram-Final backend scaffold",
    "",
    "Includes:",
    "- Express 5 API server (TypeScript + Node.js 24)",
    "- Drizzle ORM + PostgreSQL database setup",
    "- OpenAPI spec + Orval codegen (React Query hooks + Zod schemas)",
    "- pnpm monorepo workspace structure",
    "- Zod validation schemas (zod/v4)",
    "- UI component sandbox (mockup-sandbox with shadcn/ui)",
  ].join("\n");

  const commit = await ghFetch(`/repos/${OWNER}/${REPO}/git/commits`, "POST", {
    message: commitMsg,
    tree: tree.sha,
    parents: [baseSha],
  });

  console.log("Updating main branch to new commit...");
  await ghFetch(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, "PATCH", {
    sha: commit.sha,
    force: true,
  });

  console.log(`\nSuccess!`);
  console.log(`Pushed ${treeItems.length} files to https://github.com/${OWNER}/${REPO}/tree/${BRANCH}`);
  console.log(`Commit SHA: ${commit.sha}`);
}

main().catch((err) => {
  console.error("\nPush failed:", err.message);
  process.exit(1);
});
