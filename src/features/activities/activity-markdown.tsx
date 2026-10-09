import { ResearchMarkdown } from "#/features/research/research-markdown";

export function ActivityMarkdown({ text }: { text: string }) {
  return (
    <div className="text-sm leading-7 [&_p]:my-3 [&_p]:whitespace-pre-line [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-1 [&_li>ul]:my-1 [&_li>ol]:my-1">
      <ResearchMarkdown text={text} />
    </div>
  );
}
