// @vitest-environment node
import { expect, it } from "vitest";
import { beeperMessageText } from "./message-text.server";

it("turns rich messages into readable paragraphs, line breaks and link destinations", () => {
  expect(
    beeperMessageText(
      '<p>Hello <strong>Sam</strong><br>Tomorrow?</p><p><a href="https://example.com/?a=1&amp;b=2">Details</a></p>',
    ),
  ).toBe("Hello Sam\nTomorrow?\nDetails (https://example.com/?a=1&b=2)");
});
it("decodes entities once and preserves formatted code whitespace", () => {
  expect(
    beeperMessageText(
      "<pre>if (a &lt; 2) {\n  print(&quot;🍵&quot;);\n}</pre><p>&#x1F44D; &nbsp; &amp;lt;code&amp;gt;</p>",
    ),
  ).toBe('if (a < 2) {\n  print("🍵");\n}\n👍 \u00a0 &lt;code&gt;');
});
it("preserves ordinary plain text and code angle brackets", () => {
  for (const text of [
    "  hello\nworld  ",
    "a < 2 && b > 1",
    "Array<string> &lt;literal&gt;",
    "<https://example.com>",
    "Use `<div>hello</div>`.",
    "```html\n<p>code</p>\n```",
  ])
    expect(beeperMessageText(text)).toBe(text);
});
it("discards executable content and unsafe link destinations", () => {
  expect(
    beeperMessageText(
      '<p onclick="evil()">Hi<img src=x onerror="evil()"><script>secret()</script><style>.evil {}</style><a href="javascript:evil()">click</a></p>',
    ),
  ).toBe("Hiclick");
});
