const fs = require('fs');
const path = 'e:/Projects/ResumeRizz/server/utils/sendOtpEmail.js';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

console.log('=== Verifying sendOtpEmail.js ===\n');

// Show key lines
lines.forEach((line, i) => {
  if (line.includes('.replace(') || line.includes('.join(')) {
    console.log('Line ' + (i + 1) + ': ' + line.trim());
  }
});

// Check for nodemailer import (should NOT be there)
if (content.includes('import nodemailer')) {
  console.log('\nERROR: nodemailer import still present!');
} else {
  console.log('\nOK: No nodemailer import');
}

// Check for SMTP references (should NOT be there)
const smtpRefs = ['smtpHost', 'smtpPort', 'smtpUser', 'smtpPass', 'smtpSecure'];
let hasSmtp = false;
smtpRefs.forEach(ref => {
  if (content.includes(ref)) {
    console.log('ERROR: SMTP reference still present: ' + ref);
    hasSmtp = true;
  }
});
if (!hasSmtp) console.log('OK: No SMTP references');

// Check for Resend references (should be there)
const resendRefs = ['resendApiKey', 'resendFrom', 'RESEND_API_URL', 'api.resend.com'];
let hasResend = false;
resendRefs.forEach(ref => {
  if (content.includes(ref)) {
    console.log('OK: Resend reference found: ' + ref);
    hasResend = true;
  } else {
    console.log('ERROR: Missing Resend reference: ' + ref);
  }
});

// Check function signature preserved
if (content.includes('export async function sendOtpEmail(to, code)')) {
  console.log('\nOK: Function signature preserved');
} else {
  console.log('\nERROR: Function signature changed');
}

// Check error types preserved
if (content.includes('EMAIL_SERVICE_NOT_CONFIGURED') && content.includes('EMAIL_SEND_FAILED')) {
  console.log('OK: Error types preserved');
} else {
  console.log('ERROR: Error types changed');
}

// Check email content preserved (subject)
if (content.includes('Your ResumeRizz verification code')) {
  console.log('OK: Email subject preserved');
}

// Check OTP code is in HTML
if (content.includes('${code}') && content.match(/\$\{code\}/)) {
  console.log('OK: OTP code interpolation in HTML preserved');
}

// Check timeout handling
if (content.includes('AbortController') && content.includes('abort()')) {
  console.log('OK: Timeout handling with AbortController');
}

// Clean up temp files
const tempFiles = [
  'e:/Projects/ResumeRizz/write_email_file.cjs',
  'e:/Projects/ResumeRizz/fix_email_file.cjs',
  'e:/Projects/ResumeRizz/fix_email_file2.cjs',
  'e:/Projects/ResumeRizz/fix_email_file3.cjs',
  'e:/Projects/ResumeRizz/inspect_email.cjs',
  'e:/Projects/ResumeRizz/verify_sendOtp.cjs',
  'e:/Projects/ResumeRizz/scripts/writeResendEmail.cjs',
  'e:/Projects/ResumeRizz/scripts',
];
tempFiles.forEach(f => {
  try {
    if (fs.statSync(f).isDirectory()) {
      fs.rmSync(f, { recursive: true });
      console.log('Cleaned up dir: ' + f);
    } else {
      fs.unlinkSync(f);
      console.log('Cleaned up: ' + f);
    }
  } catch (e) {
    // File may not exist, that's fine
  }
});
