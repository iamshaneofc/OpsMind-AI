const fs = require('fs');
const content = fs.readFileSync('z:/opsmind-operations-ai/src/app/api/chat/route.ts', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
  const matches = line.matchAll(/([^\\]|^)`/g);
  for (const m of matches) {
    console.log(`Unescaped backtick at line ${i+1}: ${line.trim()}`);
  }
});
