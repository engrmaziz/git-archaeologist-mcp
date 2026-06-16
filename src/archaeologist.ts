import { simpleGit, SimpleGit } from "simple-git";

interface BlameLine { sha: string; author: string; line: string; }

export class Archaeologist {
  private git: SimpleGit;
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

  async explain(file: string, start: number, end: number): Promise<string> {
    const blame = await this.blameRange(file, start, end);
    const shas = [...new Set(blame.map((b) => b.sha))];
    const parts: string[] = [
      `Found ${shas.length} commit(s) behind lines ${start}-${end} of ${file}:\n`,
    ];
    for (const sha of shas) {
      const show = await this.git.show([sha, "-s", "--format=%an|%ad|%s%n%b"]);
      const [head, ...body] = show.split("\n");
      const [an, ad, subject] = head.split("|");
      parts.push(
        `- ${sha.slice(0, 8)} by ${an} (${ad})\n  ${subject}\n  ${body.join(" ").trim()}`
      );
    }
    return parts.join("\n");
  }
}
