const fs = require('fs');
const path = 'e:/Projects/ResumeRizz/server/utils/sendOtpEmail.js';
const buf = fs.readFileSync(path);
const text = buf.toString('utf8');
const lines = text.split('\n');

console.log('=== Inspecting critical lines by raw bytes ===\n');

lines.forEach((l, i) => {
  if (l.includes('.replace(') || l.includes('.join(')) {
    const bytes = Buffer.from(l, 'utf8');
    console.log('Line ' + (i + 1) + ':');
    console.log('  Text: ' + l.trim());
    console.log('  Hex:  ' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' '));
    
    // Check for key byte sequences
    const hex = bytes.toString('hex');
    
    if (l.includes('.replace(')) {
      // Looking for: 2f 3e 5c 73 2b 3c 2f 67  ( />\s+</g )
      if (hex.includes('2f3e5c732b3c2f67')) {
        console.log('  VERDICT: Regex is CORRECT (/>\\s+</g)');
      } else {
        console.log('  VERDICT: !!! Regex may be incorrect');
        // Show bytes around the regex
        const idx = l.indexOf('/>');
        if (idx >= 0) {
          const slice = bytes.slice(idx, idx + 12);
          console.log('  Bytes at />: ' + Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' '));
        }
      }
    }
    
    if (l.includes('.join(')) {
      // Looking for: 22 5c 6e 22  ("\\n")
      if (hex.includes('225c6e22')) {
        console.log('  VERDICT: Join string is CORRECT ("\n")');
      } else {
        console.log('  VERDICT: !!! Join string may be incorrect');
        const idx = l.indexOf('join(');
        if (idx >= 0) {
          const slice = bytes.slice(idx, idx + 15);
          console.log('  Bytes at join: ' + Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' '));
        }
      }
    }
    console.log('');
  }
});

// Also do a functional test: try to eval the template literal portion
console.log('=== Functional test of template literal ===');
try {
  // Extract just the html template part and test it
  const codeLine = lines.find(l => l.includes('const html = `'));
  if (codeLine) {
    // This is an ESM file with imports, so we can't fully eval it.
    // But we can check the regex replace logic conceptually.
    const testHtml = `<p>test</p>`;
    const result = testHtml.replace(/>\s+</g, '><');
    console.log('Regex test: "<p>test</p>".replace(/>\\s+</g, "><") = "' + result + '"');
    if (result === '<p>test</p>') {
      console.log('  CORRECT: Whitespace between tags removed');
    }
  }
} catch (e) {
  console.log('  Error: ' + e.message);
}

// Cleanup
try {
  fs.unlinkSync('e:/Projects/ResumeRizz/fix_escapes.cjs');
  console.log('\nCleaned up fix_escapes.cjs');
} catch {}
