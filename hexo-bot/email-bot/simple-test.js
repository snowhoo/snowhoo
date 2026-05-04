console.log('SIMPLE TEST RUNNING');
const TurndownService = require('./node_modules/turndown');
const td = new TurndownService();
const r = td.turndown('<h1>Hello</h1><p>World</p>');
console.log('Result:', r);
