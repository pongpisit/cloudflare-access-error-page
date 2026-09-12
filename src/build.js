// Build script to bundle pages into worker.js
// This reads HTML files and inlines them into the worker

const fs = require('fs');
const path = require('path');

// Read HTML files
const gatewayPageHTML = fs.readFileSync(path.join(__dirname, 'pages/cf-gateway/block.html'), 'utf-8');
const accessPageHTML = fs.readFileSync(path.join(__dirname, 'pages/cf-access/index.html'), 'utf-8');
const coachingPageHTML = fs.readFileSync(path.join(__dirname, 'pages/coaching/index.html'), 'utf-8');
const dnsDashboardHTML = fs.readFileSync(path.join(__dirname, 'pages/cf-dns-dashboard/index.html'), 'utf-8');

// Read JavaScript files
const warpInfoJS = fs.readFileSync(path.join(__dirname, 'pages/cf-access/scripts/warpinfo.js'), 'utf-8');
const deviceInfoJS = fs.readFileSync(path.join(__dirname, 'pages/cf-access/scripts/deviceinfo.js'), 'utf-8');
const postureInfoJS = fs.readFileSync(path.join(__dirname, 'pages/cf-access/scripts/postureinfo.js'), 'utf-8');
const denyReasonJS = fs.readFileSync(path.join(__dirname, 'pages/cf-access/scripts/denyreason.js'), 'utf-8');
const categoryListJS = fs.readFileSync(path.join(__dirname, 'pages/cf-dns-dashboard/categoryList.js'), 'utf-8');

// Read worker template
const workerTemplate = fs.readFileSync(path.join(__dirname, 'worker-template.js'), 'utf-8');

// Escape template literals properly
function escapeForTemplate(html) {
  return html
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/`/g, '\\`')     // Escape backticks
    .replace(/\$/g, '\\$');   // Escape dollar signs
}

// Extract just the CATEGORIES object from categoryList.js
const categoriesMatch = categoryListJS.match(/const CATEGORIES = ({[\s\S]*?});/);
const categoriesObject = categoriesMatch ? categoriesMatch[1] : '{}';

// Replace placeholders with actual HTML and JS
let workerContent = workerTemplate
  .replace('__GATEWAY_PAGE_HTML__', escapeForTemplate(gatewayPageHTML))
  .replace('__ACCESS_PAGE_HTML__', escapeForTemplate(accessPageHTML))
  .replace('__WARPINFO_JS__', escapeForTemplate(warpInfoJS))
  .replace('__DEVICEINFO_JS__', escapeForTemplate(deviceInfoJS))
  .replace('__POSTUREINFO_JS__', escapeForTemplate(postureInfoJS))
  .replace('__DENYREASON_JS__', escapeForTemplate(denyReasonJS))
  .replace('__COACHING_PAGE_HTML__', escapeForTemplate(coachingPageHTML))
  .replace('__DNS_DASHBOARD_HTML__', escapeForTemplate(dnsDashboardHTML))
  .replace(/const CATEGORIES = __CATEGORY_LIST__;/g, categoryListJS.trim());

// Write to root main.js
fs.writeFileSync(path.join(__dirname, '../main.js'), workerContent);

console.log('✅ Worker built successfully!');
console.log('📦 Pages bundled:');
console.log('   - Gateway block page (/cf-gateway/)');
console.log('   - Access information page (/cf-access/)');
console.log('   - Coaching page (/coaching/)');
console.log('   - DNS Analytics Dashboard (/cf-dns-dashboard/)');
console.log('📜 Scripts bundled:');
console.log('   - WARP info script (/cf-access/scripts/warpinfo.js)');
console.log('   - Device info script (/cf-access/scripts/deviceinfo.js)');
console.log('   - Posture info script (/cf-access/scripts/postureinfo.js)');
console.log('   - Deny reason script (/cf-access/scripts/denyreason.js)');
console.log('   - Category list (DNS dashboard)');
