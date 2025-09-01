# Bug Fixes Report

This document details three critical bugs found in the codebase and their corresponding fixes.

## Bug 1: Path Traversal Vulnerability (Security Issue)

**Severity**: Critical
**Location**: `server.js` - `/fields` and `/submit` endpoints
**Lines**: 119-125 and 147-153 (original)

### Problem
The application was vulnerable to path traversal attacks. The `template` query parameter was directly concatenated with the root directory path without any validation, allowing attackers to access files outside the intended directory using paths like:
- `../../../etc/passwd`
- `../../../../../../etc/shadow`
- `../config/sensitive.json`

### Root Cause
```javascript
// VULNERABLE CODE
const p = path.join(ORIG_ROOT, template);
```

### Fix Applied
1. **Added path validation function** (`validateTemplatePath`) that:
   - Normalizes the path to resolve any `..` or `.` components
   - Checks for path traversal attempts
   - Ensures the path is relative (not absolute)
   - Validates that the resolved path stays within the allowed directory

2. **Updated both endpoints** to use the validation function:
   ```javascript
   const p = validateTemplatePath(template);
   if (!p) {
     return res.status(400).json({ error: 'invalid template path' });
   }
   ```

### Security Impact
- **Before**: Attackers could potentially read any file on the system
- **After**: Only files within the designated template directory can be accessed

---

## Bug 2: Memory Leak in Temporary File Cleanup (Performance Issue)

**Severity**: High
**Location**: `server.js` - `fillPdf` function
**Lines**: 95-110 (original)

### Problem
Temporary files created during PDF processing (`data_*.fdf` and `out_*.pdf`) were not properly cleaned up in error scenarios, leading to:
- Disk space exhaustion over time
- Potential security issues (sensitive data in temporary files)
- System performance degradation

### Root Cause
```javascript
// VULNERABLE CODE
pdftk.on('close', (code) => {
  fs.unlink(fdfPath, () => {}); // Only cleaned up on success
  if (code !== 0) {
    return reject(new Error(`pdftk fill_form failed with exit code ${code}`));
  }
  fs.readFile(outPath, (err, buf) => {
    fs.unlink(outPath, () => {}); // Only cleaned up on success
    if (err) return reject(err);
    resolve(buf);
  });
});
```

### Fix Applied
1. **Created centralized cleanup function** that removes both temporary files
2. **Added error handling** for the `pdftk` spawn process
3. **Ensured cleanup on all exit paths**:
   - File write errors
   - Process spawn errors
   - Process execution errors
   - File read errors
   - Successful completion

```javascript
const cleanup = () => {
  try {
    if (fs.existsSync(fdfPath)) {
      fs.unlinkSync(fdfPath);
    }
    if (fs.existsSync(outPath)) {
      fs.unlinkSync(outPath);
    }
  } catch (err) {
    console.warn('Failed to cleanup temporary files:', err.message);
  }
};
```

### Performance Impact
- **Before**: Temporary files accumulated on disk, potentially causing disk space issues
- **After**: All temporary files are properly cleaned up regardless of success/failure

---

## Bug 3: Unhandled Promise Rejection in Speech Recognition (Logic Error)

**Severity**: Medium
**Location**: `public/index.html` - Speech recognition implementation
**Lines**: 108-125 (original)

### Problem
The speech recognition feature lacked proper error handling, leading to:
- Unhandled promise rejections
- Poor user experience when speech recognition failed
- No feedback to users about what went wrong
- Potential browser console errors

### Root Cause
```javascript
// VULNERABLE CODE
recognizer.onresult = (e) => {
  const text = e.results[0][0].transcript;
  // ... handle result
};
recognizer.start(); // No error handling
```

### Fix Applied
1. **Added comprehensive error handling**:
   - `onerror` event handler for speech recognition errors
   - `onend` event handler for normal completion
   - Try-catch around `recognizer.start()`

2. **User-friendly error messages** for common scenarios:
   - Microphone access denied
   - No speech detected
   - General speech recognition failures

3. **Proper error logging** for debugging

```javascript
recognizer.onerror = (e) => {
  console.error('Speech recognition error:', e.error);
  if (e.error === 'not-allowed') {
    alert('Microphone access denied. Please allow microphone access and try again.');
  } else if (e.error === 'no-speech') {
    alert('No speech detected. Please try again.');
  } else {
    alert('Speech recognition failed: ' + e.error);
  }
};
```

### User Experience Impact
- **Before**: Silent failures with no user feedback
- **After**: Clear error messages and proper error handling

---

## Testing Recommendations

1. **Path Traversal Tests**:
   - Test with `../../../etc/passwd`
   - Test with `../config/originals.json`
   - Test with absolute paths

2. **Temporary File Tests**:
   - Monitor `/tmp` directory during PDF generation
   - Test with invalid PDF templates
   - Test with process failures

3. **Speech Recognition Tests**:
   - Test with microphone access denied
   - Test with no speech input
   - Test with network connectivity issues

## Files Modified

1. `server.js` - Added path validation and improved temporary file cleanup
2. `public/index.html` - Enhanced speech recognition error handling

All fixes maintain backward compatibility and do not break existing functionality.