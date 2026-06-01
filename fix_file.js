const fs = require('fs');
const content = fs.readFileSync('z:/srl-operations-ai/src/app/api/chat/route.ts', 'utf8');
// Replace "space backtick space backtick space backtick" with escaped backticks
const fixed = content.replace(/\\` \\` \\`/g, '\\`\\`\\`');
fs.writeFileSync('z:/srl-operations-ai/src/app/api/chat/route.ts', fixed);
