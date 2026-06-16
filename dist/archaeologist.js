import { simpleGit } from "simple-git";
export class Archaeologist {
    git;
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
    async explain(file, start, end) {
        const blame = await this.blameRange(file, start, end);
        const shas = [...new Set(blame.map((b) => b.sha))];
        const parts = [
            `Found ${shas.length} commit(s) behind lines ${start}-${end} of ${file}:\n`,
        ];
        for (const sha of shas) {
            const show = await this.git.show([sha, "-s", "--format=%an|%ad|%s%n%b"]);
            const [head, ...body] = show.split("\n");
            const [an, ad, subject] = head.split("|");
            parts.push(`- ${sha.slice(0, 8)} by ${an} (${ad})\n  ${subject}\n  ${body.join(" ").trim()}`);
        }
        return parts.join("\n");
    }
}
