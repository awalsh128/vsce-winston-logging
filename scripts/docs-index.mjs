// Writes docs/api/index.html linking the API reference of each package that has one.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const packages = readdirSync(new URL("packages/", root)).filter((name) =>
  existsSync(new URL(`docs/api/${name}/index.html`, root)),
);
const items = packages.map((name) => {
  const { name: npmName, description } = JSON.parse(readFileSync(new URL(`packages/${name}/package.json`, root), "utf8"));
  return `    <li><a href="${name}/">${npmName}</a>: ${description.replace(/</g, "&lt;")}</li>`;
});
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Winston host adapters API</title>
</head>
<body>
  <h1>Winston host adapters API</h1>
  <p>Unofficial extensions of Winston, not affiliated with the Winston project.</p>
  <ul>
${items.join("\n")}
  </ul>
</body>
</html>
`;
writeFileSync(new URL("docs/api/index.html", root), html);
