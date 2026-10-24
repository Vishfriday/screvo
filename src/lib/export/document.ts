import { Directory, File, Paths } from "expo-file-system";
import { fmtTime } from "@/lib/format";
import { projectSpeed } from "@/lib/speed";
import type { Project } from "@/lib/types";
import { SaveCancelledError } from "./save";

/**
 * The written formats: a guide, a knowledge-base article, an SOP.
 *
 * These used to be choosable and then save an MP4 anyway — picking "SOP PDF"
 * handed you a video file. They are real documents now, built from the steps
 * and the narration the analysis already produced.
 *
 * They are written as HTML rather than PDF because nothing in this build can
 * typeset a PDF, and an HTML page prints to one from any browser. The format
 * list says so instead of promising otherwise.
 */

export type DocumentKind = "sop" | "guide" | "kb";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The steps, with whatever narration was written for each. */
function steps(project: Project) {
  return project.chapters
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((c, i) => ({
      n: i + 1,
      name: c.name,
      at: c.start,
      lasts: c.duration,
      // a step's narration is the closest thing to a written instruction
      body:
        project.script.find((s) => s.chapterId === c.id)?.text ??
        c.summary ??
        "",
    }));
}

function render(project: Project, kind: DocumentKind): string {
  const list = steps(project);
  const speed = projectSpeed(project);
  const runs = project.durationSec / speed;
  const title = escape(project.name);
  const heading =
    kind === "sop" ? "Standard operating procedure" : kind === "kb" ? "Knowledge base article" : "Step-by-step guide";

  const rows = list
    .map(
      (s) => `
      <li>
        <h2>${escape(s.name)}</h2>
        <p class="at">${fmtTime(s.at)} — ${fmtTime(s.at + s.lasts)}</p>
        ${s.body ? `<p>${escape(s.body)}</p>` : `<p class="empty">No narration was written for this step.</p>`}
      </li>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — ${heading}</title>
<style>
  :root { color-scheme: light dark; --ink: #16161d; --dim: #5b5b6b; --rule: #e4e4ec; --brand: #5B5FD1; }
  @media (prefers-color-scheme: dark) {
    :root { --ink: #ececf2; --dim: #9a9aae; --rule: #2a2a36; }
    body { background: #0e0e15; }
  }
  body { margin: 0 auto; padding: 40px 24px 72px; max-width: 46rem; font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: var(--ink); }
  header { border-bottom: 2px solid var(--brand); padding-bottom: 20px; margin-bottom: 28px; }
  .kicker { color: var(--brand); font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; margin: 0 0 6px; }
  h1 { font-size: 28px; line-height: 1.25; margin: 0 0 10px; letter-spacing: -.02em; }
  .meta, .at { color: var(--dim); font-size: 13px; margin: 0; }
  .summary { margin: 14px 0 0; }
  ol { list-style: none; counter-reset: step; padding: 0; margin: 0; }
  li { counter-increment: step; border-top: 1px solid var(--rule); padding: 22px 0 6px 52px; position: relative; }
  li::before { content: counter(step); position: absolute; left: 0; top: 22px; width: 32px; height: 32px; border-radius: 50%; background: var(--brand); color: #fff; font-size: 14px; font-weight: 700; display: grid; place-items: center; }
  h2 { font-size: 18px; margin: 0 0 2px; }
  .at { margin-bottom: 10px; font-variant-numeric: tabular-nums; }
  .empty { color: var(--dim); font-style: italic; }
  footer { margin-top: 40px; padding-top: 18px; border-top: 1px solid var(--rule); color: var(--dim); font-size: 12px; }
  @media print { body { padding: 0; max-width: none; } li { break-inside: avoid; } }
</style>
<header>
  <p class="kicker">${escape(heading)}</p>
  <h1>${title}</h1>
  <p class="meta">${list.length} step${list.length === 1 ? "" : "s"} · ${fmtTime(runs)}${speed !== 1 ? ` at ${speed}×` : ""}</p>
  ${project.summary ? `<p class="summary">${escape(project.summary)}</p>` : ""}
</header>
<ol>${rows}
</ol>
<footer>Written from the Screvo recording${project.chapters.length ? "" : " — no steps were found, so there is nothing to list"}. Print this page to save it as a PDF.</footer>
</html>`;
}

/** "Onboarding walkthrough — guide.html" */
function fileNameFor(project: Project, kind: DocumentKind): string {
  const base = project.name.replace(/[^\w\s-]/g, "").trim() || "Screvo project";
  const suffix = kind === "sop" ? "SOP" : kind === "kb" ? "article" : "guide";
  return `${base} — ${suffix}.html`;
}

export interface SavedDocument {
  uri: string;
  name: string;
  bytes: number;
}

/**
 * Builds the document and copies it into a folder the user picks. The file is
 * written into Screvo's own storage first so there is always something to
 * retry with if the picker is dismissed.
 */
export async function saveProjectDocument(project: Project, kind: DocumentKind): Promise<SavedDocument> {
  const html = render(project, kind);
  const name = fileNameFor(project, kind);

  const staged = new File(Paths.document, `doc_${Date.now()}.html`);
  staged.create({ overwrite: true });
  staged.write(html);

  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch {
    throw new SaveCancelledError();
  }
  if (!folder) throw new SaveCancelledError();

  const destination = folder.createFile(name, "text/html");
  try {
    destination.write(html);
  } catch (e) {
    try {
      destination.delete();
    } catch {
      // the provider may refuse the delete; the caller still hears about it
    }
    throw e;
  }
  return { uri: destination.uri, name, bytes: html.length };
}
