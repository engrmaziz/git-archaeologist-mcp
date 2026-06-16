import { simpleGit } from "simple-git";
import { Octokit } from "@octokit/rest";
export class Archaeologist {
    git;
    gh = new Octokit({ auth: process.env.GITHUB_TOKEN });
    constructor(repoPath) { this.git = simpleGit(repoPath); }
    async blameRange(file, start, end) {
        const raw = await this.git.raw([
            "blame", "-L", `${start},${end}`, "--line-porcelain", file,
        ]);
        return this.parseBlame(raw);
    }
    parseBlame(raw) {
        const out = [];
        const lines = raw.split("\n");
        let sha = "", author = "";
        for (const l of lines) {
            if (/^[0-9a-f]{40} /.test(l))
                sha = l.split(" ")[0];
            else if (l.startsWith("author "))
                author = l.slice(7);
            else if (l.startsWith("\t"))
                out.push({ sha, author, line: l.slice(1) });
        }
        return out;
    }
    // Read owner/repo from the git "origin" remote URL.
    async remoteSlug() {
        const remotes = await this.git.getRemotes(true);
        const url = remotes.find((r) => r.name === "origin")?.refs.fetch;
        if (!url)
            return null;
        const m = url.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
        return m ? { owner: m[1], repo: m[2] } : null;
    }
    // Find the PR(s) that contained a given commit SHA.
    async prsForCommit(owner, repo, sha) {
        const res = await this.gh.repos.listPullRequestsAssociatedWithCommit({
            owner, repo, commit_sha: sha,
        });
        return res.data.map((p) => ({
            number: p.number, title: p.title, body: p.body || "", url: p.html_url,
        }));
    }
    // Parse "fixes #12", "closes #34", etc. from any text.
    linkedIssueNumbers(text) {
        const matches = text.matchAll(/\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#(\d+)/gi);
        return [...new Set([...matches].map((m) => Number(m[1])))];
    }
    // Fetch a single issue's title, body, and URL.
    async issue(owner, repo, number) {
        const res = await this.gh.issues.get({ owner, repo, issue_number: number });
        return {
            number, title: res.data.title, body: res.data.body || "", url: res.data.html_url,
        };
    }
    async explain(file, start, end) {
        const blame = await this.blameRange(file, start, end);
        const shas = [...new Set(blame.map((b) => b.sha))];
        const slug = await this.remoteSlug();
        const parts = [
            `Found ${shas.length} commit(s) behind lines ${start}-${end} of ${file}:\n`,
        ];
        for (const sha of shas) {
            const show = await this.git.show([sha, "-s", "--format=%an|%ad|%s%n%b"]);
            const [head, ...body] = show.split("\n");
            const [an, ad, subject] = head.split("|");
            parts.push(`- ${sha.slice(0, 8)} by ${an} (${ad})\n  ${subject}`);
            if (!slug)
                continue;
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
            }
            catch (e) {
                parts.push(`  (could not fetch GitHub context: ${e.message})`);
            }
        }
        return parts.join("\n");
    }
}
