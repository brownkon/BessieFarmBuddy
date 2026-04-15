const { formatDate } = require('./backend/tools/utils');

console.log('Today:', formatDate(new Date().toISOString()));
console.log('Yesterday:', formatDate(new Date(Date.now() - 86400000).toISOString()));
console.log('3 days ago:', formatDate(new Date(Date.now() - 3 * 86400000).toISOString()));
console.log('8 days ago (2025-09-24):', formatDate('2025-09-24'));
console.log('2026-04-08:', formatDate('2026-04-08'));
