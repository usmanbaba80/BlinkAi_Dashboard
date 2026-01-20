// Adds a floating "View Analytics Dashboard" button to AdminJS pages
// Skips the login page. Runs on DOMContentLoaded.
(function () {
  if (typeof window === 'undefined') return;
  if (window.location.pathname.endsWith('/login')) return;

  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('analytics-dashboard-button')) return;

    const btnWrapper = document.createElement('div');
    btnWrapper.id = 'analytics-dashboard-button';
    btnWrapper.style.position = 'fixed';
    btnWrapper.style.bottom = '30px';
    btnWrapper.style.right = '30px';
    btnWrapper.style.zIndex = '9999';

    btnWrapper.innerHTML = `
      <a href="/dashboard" style="
        display: flex;
        align-items: center;
        gap: 12px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 16px 28px;
        border-radius: 50px;
        text-decoration: none;
        font-weight: 700;
        font-size: 16px;
        box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
        transition: all 0.3s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      ">
        <span style="font-size: 24px;">📊</span>
        <span>View Analytics Dashboard</span>
      </a>
      <style>
        #analytics-dashboard-button a:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 32px rgba(102, 126, 234, 0.5) !important;
        }
      </style>
    `;

    document.body.appendChild(btnWrapper);
  });
})();
