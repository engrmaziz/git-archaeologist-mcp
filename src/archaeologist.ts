import { simpleGit, SimpleGit } from "simple-git";
import { Octokit } from "@octokit/rest";
import { Cache } from "./cache.js";

interface BlameLine { sha: string; author: string; line: string; }

export class Archaeologist {
  private git: SimpleGit;
  private gh = new Octokit({ auth: process.env.GITHUB_TOKEN });
  private cache = new Cache();

  constructor(repoPath: string) { this.git = simpleGit(repoPath); }

  async blameRange(file: string, start: number, end: number): Promise<BlameLine[]> {
    const raw = await this.git.raw([
      "blame", "-L", `${start},${end}`, "--line-porcelain", file,
    ]);
    return this.parseBlame(raw);
  }

  private parseBlame(raw: string): BlameLine[] {
    const out: BlameLine[] = [];
    const lines = raw.split("\n");
    let sha = "", author = "";
    for (const l of lines) {
      if (/^[0-9a-f]{40} /.test(l)) sha = l.split(" ")[0];
      else if (l.startsWith("author ")) author = l.slice(7);
      else if (l.startsWith("\t")) out.push({ sha, author, line: l.slice(1) });
    }
    return out;
  }

  // Read owner/repo from the git "origin" remote URL.
  async remoteSlug(): Promise<{ owner: string; repo: string } | null> {
    const remotes = await this.git.getRemotes(true);
    const url = remotes.find((r) => r.name === "origin")?.refs.fetch;
    if (!url) return null;
    const m = url.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    return m ? { owner: m[1], repo: m[2] } : null;
  }

  // Find the PR(s) that contained a given commit SHA (cached).
  async prsForCommit(owner: string, repo: string, sha: string) {
    const key = `prs:${owner}/${repo}:${sha}`;
    const hit = this.cache.get<ReturnType<typeof mapPrs>>(key);
    if (hit) return hit;

    const res = await this.gh.repos.listPullRequestsAssociatedWithCommit({
      owner, repo, commit_sha: sha,
    });
    const out = mapPrs(res.data);
    this.cache.set(key, out);
    return out;
  }

  // Parse "fixes #12", "closes #34", etc. from any text.
  linkedIssueNumbers(text: string): number[] {
    const matches = text.matchAll(
      /\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#(\d+)/gi
    );
    return [...new Set([...matches].map((m) => Number(m[1])))];
  }

  // Fetch a single issue's title, body, and URL (cached).
  async issue(owner: string, repo: string, number: number) {
    const key = `issue:${owner}/${repo}:${number}`;
    const hit = this.cache.get<{ number: number; title: string; body: string; url: string }>(key);
    if (hit) return hit;

    const res = await this.gh.issues.get({ owner, repo, issue_number: number });
    const out = {
      number, title: res.data.title, body: res.data.body || "", url: res.data.html_url,
    };
    this.cache.set(key, out);
    return out;
  }

  // Rank contributors to a path by commit count, weighted toward recent work.
  async experts(path: string): Promise<string> {
    const log = await this.git.log({ file: path, maxCount: 300 });
    if (log.all.length === 0) {
      return `No commit history found for ${path}.`;
    }
    const now = Date.now();
    const score: Record<string, number> = {};
    for (const c of log.all) {
      const ageDays = (now - new Date(c.date).getTime()) / 86_400_000;
      const weight = Math.exp(-ageDays / 180); // ~6-month decay
      score[c.author_name] = (score[c.author_name] || 0) + weight;
    }
    const ranked = Object.entries(score)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const lines = ranked.map(
      ([name, s], i) => `${i + 1}. ${name} (recency-weighted score ${s.toFixed(2)})`
    );
    return `Top contributors to ${path}:\n${lines.join("\n")}`;
  }



  async explain(file: string, start: number, end: number): Promise<string> {
    const blame = await this.blameRange(file, start, end);
    const shas = [...new Set(blame.map((b) => b.sha))];
    const slug = await this.remoteSlug();
    const parts: string[] = [
      `Found ${shas.length} commit(s) behind lines ${start}-${end} of ${file}:\n`,
    ];

    for (const sha of shas) {
      const show = await this.git.show([sha, "-s", "--format=%an|%ad|%s%n%b"]);
      const [head, ...body] = show.split("\n");
      const [an, ad, subject] = head.split("|");
      parts.push(`- ${sha.slice(0, 8)} by ${an} (${ad})\n  ${subject}`);

      if (!slug) continue;

      try {
        const prs = await this.prsForCommit(slug.owner, slug.repo, sha);
        for (const pr of prs) {
          parts.push(`  PR #${pr.number}: ${pr.title}\n  ${pr.url}`);
          const issueNums = this.linkedIssueNumbers(`${pr.title} ${pr.body}`);
          for (const n of issueNums) {
            const iss = await this.issue(slug.owner, slug.repo, n);
            parts.push(`    Issue #${iss.number}: ${iss.title}\n    ${iss.url}`);
          }
        }
      } catch (e) {
        parts.push(`  (could not fetch GitHub context: ${(e as Error).message})`);
      }
    }
    return parts.join("\n");
  }
}

// Shared mapper so cached and live return shapes match.
function mapPrs(
  data: Array<{ number: number; title: string; body: string | null; html_url: string }>
) {
  return data.map((p) => ({
    number: p.number, title: p.title, body: p.body || "", url: p.html_url,
  }));
}
