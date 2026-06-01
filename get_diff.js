const { execSync } = require('child_process');
console.log(execSync('git diff src/app/api/chat/route.ts').toString());
