import { Fragment, type ReactNode } from "react";

interface MessageContentProps {
  content: string;
}

function renderInline(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*.+?\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\))/g);

  return tokens.filter(Boolean).map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={index}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith("`") && token.endsWith("`")) {
      return <code key={index}>{token.slice(1, -1)}</code>;
    }
    const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (link) {
      return (
        <a href={link[2]} key={index} rel="noreferrer" target="_blank">
          {link[1]}
        </a>
      );
    }
    return <Fragment key={index}>{token}</Fragment>;
  });
}

export function MessageContent({ content }: MessageContentProps) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(<p key={`p-${blocks.length}`}>{renderInline(paragraph.join("\n"))}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`}>
        {list.map((item, index) => <li key={index}>{renderInline(item)}</li>)}
      </ul>,
    );
    list = [];
  };

  lines.forEach((line) => {
    if (line.trimStart().startsWith("```")) {
      if (code) {
        blocks.push(<pre key={`pre-${blocks.length}`}><code>{code.join("\n")}</code></pre>);
        code = null;
      } else {
        flushParagraph();
        flushList();
        code = [];
      }
      return;
    }
    if (code) {
      code.push(line);
      return;
    }
    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      list.push(listItem[1]);
      return;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      return;
    }
    flushList();
    paragraph.push(line);
  });

  flushParagraph();
  flushList();
  if (code !== null) {
    const remainingCode = code as string[];
    blocks.push(<pre key={`pre-${blocks.length}`}><code>{remainingCode.join("\n")}</code></pre>);
  }

  return <div className="message-content">{blocks}</div>;
}
