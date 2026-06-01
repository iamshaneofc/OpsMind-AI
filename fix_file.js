const fs = require('fs');
const content = fs.readFileSync('z:/opsmind-operations-ai/src/app/api/chat/route.ts', 'utf8');
// Replace "space backtick space backtick space backtick" with escaped backticks
const fixed = content.replace(/\\` \\` \\`/g, '\\`\\`\\`');
fs.writeFileSync('z:/opsmind-operations-ai/src/app/api/chat/route.ts', fixed);
