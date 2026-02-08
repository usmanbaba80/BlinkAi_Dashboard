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
    btnWrapper.style.zIndex = '999';

    btnWrapper.innerHTML = `
      <a href="/dashboard" style="
        display: flex;
        align-items: center;
        gap: 12px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 10px 18px;
        border-radius: 40px;
        text-decoration: none;
        font-weight: 600;
        font-size: 14px;
        box-shadow: 0 6px 16px rgba(102, 126, 234, 0.35);
        transition: all 0.3s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      ">
        <span style="font-size: 20px;">📊</span>
        <span>View Analytics Dashboard</span>
      </a>
      <style>
        #analytics-dashboard-button a:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 24px rgba(102, 126, 234, 0.4) !important;
        }
      </style>
    `;

    document.body.appendChild(btnWrapper);
  });
})();
