(function () {
  var mobileQuery = window.matchMedia('(max-width: 820px)');

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    navigator.serviceWorker.register('/sw.js').catch(function (err) {
      console.error('Service worker registration failed:', err);
    });
  }

  function scrollThreadToBottom() {
    var thread = document.querySelector('.message-thread');

    if (!thread) {
      return;
    }

    thread.scrollTop = thread.scrollHeight;
  }

  function setupMobileThreadHistory() {
    var shell = document.querySelector('.messenger-shell');

    if (!shell || !shell.classList.contains('is-thread-open') || !mobileQuery.matches) {
      return;
    }

    if (window.history.state && window.history.state.smsSyncPrepared) {
      return;
    }

    var currentUrl = window.location.href;
    var contactsUrl = window.location.origin + window.location.pathname;

    window.history.replaceState({
      smsSyncPrepared: true,
      smsSyncView: 'contacts'
    }, '', contactsUrl);

    window.history.pushState({
      smsSyncPrepared: true,
      smsSyncView: 'thread'
    }, '', currentUrl);
  }

  function setupBackButton() {
    var shell = document.querySelector('.messenger-shell');
    var backButton = document.querySelector('.thread-back');

    if (!shell || !backButton) {
      return;
    }

    backButton.addEventListener('click', function (event) {
      if (!mobileQuery.matches) {
        return;
      }

      event.preventDefault();
      window.history.back();
    });

    window.addEventListener('popstate', function (event) {
      if (!mobileQuery.matches || !event.state || !event.state.smsSyncView) {
        return;
      }

      shell.classList.toggle('is-thread-open', event.state.smsSyncView === 'thread');

      if (event.state.smsSyncView === 'thread') {
        window.setTimeout(scrollThreadToBottom, 0);
      }
    });
  }

  window.addEventListener('load', function () {
    registerServiceWorker();
    setupMobileThreadHistory();
    setupBackButton();
    window.setTimeout(scrollThreadToBottom, 0);
  });
})();
