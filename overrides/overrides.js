(function() {
  /**
   * This script is intended to be used as a custom override in Paperless‑ngx. It injects
   * a "New inspection from this" button on the document details page. The button
   * links to the inspector sidecar service, passing the current document ID.
   */
  function waitForSelector(selector, callback) {
    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(interval);
        callback(el);
      }
    }, 500);
  }
  // Extract doc ID from the URL (/documents/<id>/)
  const match = window.location.pathname.match(/documents\/(\d+)/);
  if (!match) return;
  const docId = match[1];
  // Insert button into the action bar when available
  waitForSelector('header .actions, .document-actions', (bar) => {
    // Avoid duplicating the button if injected multiple times
    if (bar.querySelector('.nsf-inspector-btn')) return;
    const a = document.createElement('a');
    a.textContent = 'New inspection from this';
    // The inspector base URL should match your deployment. Adjust as needed.
    const base = window.INSPECTOR_BASE_URL || 'http://localhost:8087';
    a.href = `${base}/start?doc_id=${docId}`;
    a.target = '_blank';
    a.className = 'nsf-inspector-btn';
    a.style.cssText = 'margin-left:8px;padding:6px 10px;border:1px solid #64748b;border-radius:8px;background:#1e293b;color:#e2e8f0;text-decoration:none;';
    bar.appendChild(a);
  });
})();