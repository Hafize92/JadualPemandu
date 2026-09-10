const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const output = path.join(root, ".firebase-public");
const files = ["index.html", "app.js", "access-policy.mjs", "supervisor-report.mjs", "styles.css", "firebase-config.js", "jkr-logo.png"];
fs.mkdirSync(output, { recursive: true });
// Refuse unexpected files rather than publishing logs or credentials accidentally.
if (fs.readdirSync(output).some(file => !files.includes(file))) throw new Error("Unexpected file in hosting output; deployment stopped.");
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(output, file));
console.log(`Prepared ${files.length} public assets.`);
