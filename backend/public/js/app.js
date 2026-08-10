(function () {
  var mobileQuery = window.matchMedia('(max-width: 820px)');
  var shell = null;
  var thread = null;
  var header = null;
  var links = [];
  var backButton = null;
  var settingsButton = null;
  var settingsPanel = null;
  var settingsPreviousFocus = null;
  var notificationButton = null;
  var updateButton = null;
  var updateStatus = null;
  var availableVersion = '';
  var latestNotificationSync = '';
  var currentAddress = '';
  var currentConversation = null;
  var nextCursor = null;
  var hasMore = false;
  var isLoadingInitial = false;
  var isLoadingOlder = false;

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    var version = shell?.dataset.appVersion || 'dev';

    navigator.serviceWorker.register('/sw.js?v=' + encodeURIComponent(version)).catch(function (err) {
      console.error('Service worker registration failed:', err);
    });
  }

  function getCurrentVersion() {
    return shell?.dataset.appVersion || 'unknown';
  }

  function getNotificationStorageKey() {
    var deviceCode = shell?.dataset.deviceCode || 'default';

    return 'sms-sync-latest-notification-sync:' + deviceCode;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDateTime(value) {
    return new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  }

  function scrollThreadToBottom() {
    if (!thread) {
      return;
    }

    thread.scrollTop = thread.scrollHeight;
  }

  function setActiveLink(address) {
    links.forEach(function (link) {
      link.classList.toggle('is-active', link.dataset.address === address);
    });
  }

  function findConversation(address) {
    return links
      .map(function (link) {
        return {
          address: link.dataset.address || '',
          displayName: link.dataset.displayName || link.dataset.address || '',
          contactEmail: link.dataset.contactEmail || ''
        };
      })
      .find(function (conversation) {
        return conversation.address === address;
      }) || null;
  }

  function renderHeader(conversation) {
    var avatar = header.querySelector('.avatar');
    var title = header.querySelector('h2');
    var subtitle = header.querySelector('p');
    var displayName = conversation.displayName || conversation.address;

    header.classList.remove('is-empty');
    avatar.textContent = displayName.slice(0, 1).toUpperCase();
    title.textContent = displayName;
    subtitle.textContent = conversation.contactEmail || conversation.address;
  }

  function renderInitialLoader() {
    thread.dataset.empty = 'false';
    thread.innerHTML = [
      '<div class="chat-loading is-centered" role="status" aria-live="polite">',
      '<span></span>',
      '<strong>Loading messages...</strong>',
      '</div>'
    ].join('');
  }

  function renderError(message) {
    thread.innerHTML = [
      '<div class="thread-empty">',
      '<h2>Could not load messages</h2>',
      '<p>' + escapeHtml(message) + '</p>',
      '</div>'
    ].join('');
  }

  function renderMessage(message) {
    var isSent = message.direction === 'sent';
    var label = isSent ? 'Sent' : 'Received';

    return [
      '<article class="bubble-row ' + (isSent ? 'is-sent' : 'is-received') + '" data-message-id="' + escapeHtml(message.id) + '">',
      '<div class="message-bubble">',
      '<p>' + escapeHtml(message.body) + '</p>',
      '<footer>',
      '<span>' + label + '</span>',
      '<time datetime="' + escapeHtml(message.messageAt) + '">' + escapeHtml(formatDateTime(message.messageAt)) + '</time>',
      '</footer>',
      '</div>',
      '</article>'
    ].join('');
  }

  function renderMessages(messages) {
    thread.dataset.empty = 'false';

    if (!messages.length) {
      thread.innerHTML = [
        '<div class="thread-empty">',
        '<h2>No messages</h2>',
        '<p>This contact has no synced messages yet.</p>',
        '</div>'
      ].join('');
      return;
    }

    thread.innerHTML = messages.map(renderMessage).join('');
  }

  function showOlderLoader() {
    if (thread.querySelector('.chat-loading.is-top')) {
      return;
    }

    thread.insertAdjacentHTML('afterbegin', [
      '<div class="chat-loading is-top" role="status" aria-live="polite">',
      '<span></span>',
      '<strong>Loading older messages...</strong>',
      '</div>'
    ].join(''));
  }

  function removeOlderLoader() {
    var loader = thread.querySelector('.chat-loading.is-top');

    if (loader) {
      loader.remove();
    }
  }

  function buildMessagesUrl(address, cursor) {
    var params = new URLSearchParams({
      address: address,
      limit: '100'
    });

    if (cursor) {
      params.set('beforeMessageAt', cursor.beforeMessageAt);
      params.set('beforeId', cursor.beforeId);
    }

    return '/api/messages?' + params.toString();
  }

  function fetchMessages(address, cursor) {
    return fetch(buildMessagesUrl(address, cursor), {
      headers: {
        Accept: 'application/json'
      }
    }).then(function (response) {
      if (!response.ok) {
        throw new Error('Server returned HTTP ' + response.status);
      }

      return response.json();
    });
  }

  function openConversation(address, options) {
    var settings = options || {};
    var conversation = findConversation(address);

    if (!conversation || isLoadingInitial) {
      return;
    }

    currentAddress = address;
    currentConversation = conversation;
    nextCursor = null;
    hasMore = false;
    isLoadingInitial = true;

    shell.classList.add('is-thread-open');
    shell.dataset.threadAddress = address;
    setActiveLink(address);
    renderHeader(conversation);
    renderInitialLoader();

    if (settings.pushState !== false) {
      window.history.pushState({
        smsSyncView: 'thread',
        address: address
      }, '', '/?address=' + encodeURIComponent(address));
    }

    fetchMessages(address)
      .then(function (data) {
        if (currentAddress !== address) {
          return;
        }

        hasMore = Boolean(data.hasMore);
        nextCursor = data.nextCursor || null;
        renderMessages(data.messages || []);
        window.requestAnimationFrame(scrollThreadToBottom);
      })
      .catch(function (err) {
        renderError(err.message || 'Please try again.');
      })
      .finally(function () {
        isLoadingInitial = false;
      });
  }

  function closeConversation(options) {
    var settings = options || {};

    currentAddress = '';
    currentConversation = null;
    nextCursor = null;
    hasMore = false;
    isLoadingOlder = false;
    shell.classList.remove('is-thread-open');
    shell.dataset.threadAddress = '';
    setActiveLink('');

    if (settings.replaceUrl !== false) {
      window.history.replaceState({
        smsSyncView: 'contacts'
      }, '', '/');
    }
  }

  function loadOlderMessages() {
    if (!currentAddress || !hasMore || !nextCursor || isLoadingOlder || isLoadingInitial) {
      return;
    }

    isLoadingOlder = true;
    var previousHeight = thread.scrollHeight;
    showOlderLoader();

    fetchMessages(currentAddress, nextCursor)
      .then(function (data) {
        var messages = data.messages || [];
        var html = messages.map(renderMessage).join('');

        removeOlderLoader();

        if (html) {
          thread.insertAdjacentHTML('afterbegin', html);
        }

        hasMore = Boolean(data.hasMore);
        nextCursor = data.nextCursor || null;
        thread.scrollTop = thread.scrollHeight - previousHeight;
      })
      .catch(function () {
        removeOlderLoader();
      })
      .finally(function () {
        isLoadingOlder = false;
      });
  }

  function setupConversationLinks() {
    links.forEach(function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
        openConversation(link.dataset.address || '');
      });
    });
  }

  function setupBackButton() {
    if (!backButton) {
      return;
    }

    backButton.addEventListener('click', function (event) {
      event.preventDefault();

      if (window.history.state && window.history.state.smsSyncView === 'thread') {
        window.history.back();
      } else {
        closeConversation();
      }
    });
  }

  function setupHistory() {
    window.history.replaceState({
      smsSyncView: 'contacts'
    }, '', window.location.pathname);

    window.addEventListener('popstate', function (event) {
      if (event.state && event.state.smsSyncView === 'thread' && event.state.address) {
        openConversation(event.state.address, {
          pushState: false
        });
        return;
      }

      closeConversation({
        replaceUrl: false
      });
    });

    var address = new URLSearchParams(window.location.search).get('address');

    if (address) {
      openConversation(address, {
        pushState: true
      });
    }
  }

  function setupInfiniteScroll() {
    thread.addEventListener('scroll', function () {
      if (thread.scrollTop <= 40) {
        loadOlderMessages();
      }
    });
  }

  function updateDeviceStatus(status) {
    var dots = Array.prototype.slice.call(document.querySelectorAll('.status-dot'));
    var label = document.querySelector('[data-device-status]');
    var lastPing = document.querySelector('[data-device-last-ping]');

    if (!dots.length || !label || !lastPing || !status) {
      return;
    }

    dots.forEach(function (dot) {
      dot.classList.toggle('is-online', Boolean(status.online));
      dot.classList.toggle('is-offline', !status.online);
    });
    label.textContent = status.online ? 'Online' : 'Offline';
    lastPing.textContent = status.lastPingAt
      ? new Intl.DateTimeFormat('en', { timeStyle: 'medium' }).format(new Date(status.lastPingAt))
      : 'Never';
  }

  function fetchDeviceStatus() {
    fetch('/api/device/status', {
      headers: {
        Accept: 'application/json'
      }
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Status request failed');
        }

        return response.json();
      })
      .then(function (data) {
        updateDeviceStatus(data.device);
      })
      .catch(function () {
        updateDeviceStatus({
          online: false,
          lastPingAt: null
        });
      });
  }

  function setupDeviceStatusPolling() {
    fetchDeviceStatus();
    window.setInterval(fetchDeviceStatus, 30000);
  }

  function updateNotificationButton() {
    if (!notificationButton || !('Notification' in window)) {
      return;
    }

    if (Notification.permission === 'granted') {
      notificationButton.textContent = 'Enabled';
      notificationButton.disabled = true;
      return;
    }

    if (Notification.permission === 'denied') {
      notificationButton.textContent = 'Blocked';
      notificationButton.disabled = true;
      return;
    }

    notificationButton.textContent = 'Enable';
    notificationButton.disabled = false;
  }

  function requestNotificationPermission() {
    if (!('Notification' in window)) {
      return;
    }

    Notification.requestPermission().then(updateNotificationButton);
  }

  function getMessageTitle(message, count) {
    if (count > 1) {
      return count + ' new SMS messages';
    }

    return 'New SMS from ' + (message.contactName || message.address || 'Unknown');
  }

  function showMessageNotification(messages) {
    if (!messages.length || !('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    var latest = messages[messages.length - 1];
    var title = getMessageTitle(latest, messages.length);
    var body = messages.length > 1 ? latest.body : latest.body;
    var url = latest.address ? '/?address=' + encodeURIComponent(latest.address) : '/';
    var options = {
      body: body,
      icon: '/icons/icon-192.png',
      badge: '/icons/maskable-512.png',
      tag: latest.address || 'sms-sync-message',
      renotify: true,
      data: {
        url: url
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(function (registration) {
          registration.showNotification(title, options);
        })
        .catch(function () {
          new Notification(title, options);
        });
      return;
    }

    new Notification(title, options);
  }

  function fetchMessageNotifications() {
    if (!latestNotificationSync) {
      latestNotificationSync = shell?.dataset.latestSync || new Date().toISOString();
      window.localStorage.setItem(getNotificationStorageKey(), latestNotificationSync);
      return;
    }

    var params = new URLSearchParams({
      after: latestNotificationSync,
      limit: '10'
    });

    fetch('/api/messages/notifications?' + params.toString(), {
      headers: {
        Accept: 'application/json'
      }
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Notification ping failed');
        }

        return response.json();
      })
      .then(function (data) {
        var messages = data.messages || [];

        if (messages.length) {
          showMessageNotification(messages);
        }

        if (data.latestSyncedAt) {
          latestNotificationSync = data.latestSyncedAt;
          window.localStorage.setItem(getNotificationStorageKey(), latestNotificationSync);
        }
      })
      .catch(function () {});
  }

  function setupMessageNotificationPolling() {
    latestNotificationSync = window.localStorage.getItem(getNotificationStorageKey()) || shell?.dataset.latestSync || new Date().toISOString();
    window.localStorage.setItem(getNotificationStorageKey(), latestNotificationSync);

    if (notificationButton) {
      updateNotificationButton();
      notificationButton.addEventListener('click', requestNotificationPermission);
    }

    window.setInterval(fetchMessageNotifications, 30000);
  }

  function setupSettingsPanel() {
    if (!settingsButton || !settingsPanel) {
      return;
    }

    function closeSettings() {
      settingsPanel.hidden = true;
      settingsButton.classList.remove('is-active');
      settingsButton.setAttribute('aria-expanded', 'false');

      if (settingsPreviousFocus && typeof settingsPreviousFocus.focus === 'function') {
        settingsPreviousFocus.focus();
      }
    }

    function openSettings() {
      settingsPreviousFocus = document.activeElement;
      settingsPanel.hidden = false;
      settingsButton.classList.add('is-active');
      settingsButton.setAttribute('aria-expanded', 'true');

      var focusTarget = settingsPanel.querySelector('.settings-card');

      if (focusTarget) {
        focusTarget.focus();
      }
    }

    settingsButton.addEventListener('click', function () {
      if (settingsPanel.hidden) {
        openSettings();
        return;
      }

      closeSettings();
    });

    Array.prototype.slice.call(settingsPanel.querySelectorAll('[data-settings-close]')).forEach(function (control) {
      control.addEventListener('click', closeSettings);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !settingsPanel.hidden) {
        closeSettings();
      }
    });
  }

  function setUpdateUi(message, buttonText, disabled) {
    if (updateStatus) {
      updateStatus.textContent = message;
    }

    if (updateButton) {
      updateButton.textContent = buttonText;
      updateButton.disabled = Boolean(disabled);
    }
  }

  function clearAppCaches() {
    if (!('caches' in window)) {
      return Promise.resolve();
    }

    return caches.keys().then(function (keys) {
      return Promise.all(keys
        .filter(function (key) {
          return key.indexOf('sms-sync-') === 0;
        })
        .map(function (key) {
          return caches.delete(key);
        }));
    });
  }

  function applyAppUpdate() {
    setUpdateUi('Updating...', 'Updating', true);

    Promise.resolve()
      .then(function () {
        return clearAppCaches();
      })
      .then(function () {
        if (!('serviceWorker' in navigator)) {
          return null;
        }

        return navigator.serviceWorker.getRegistration().then(function (registration) {
          return registration ? registration.update() : null;
        });
      })
      .catch(function () {})
      .finally(function () {
        window.location.replace('/?updated=' + Date.now());
      });
  }

  function checkForAppUpdate() {
    if (!updateButton) {
      return;
    }

    var currentVersion = getCurrentVersion();

    setUpdateUi('Checking...', 'Checking', true);

    fetch('/api/version?ts=' + Date.now(), {
      cache: 'no-store',
      headers: {
        Accept: 'application/json'
      }
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Version check failed');
        }

        return response.json();
      })
      .then(function (data) {
        availableVersion = data.version || '';

        if (availableVersion && availableVersion !== currentVersion) {
          setUpdateUi('Update available v' + availableVersion, 'Update', false);
          return;
        }

        setUpdateUi('Current v' + currentVersion, 'Check', false);
      })
      .catch(function () {
        setUpdateUi('Could not check', 'Retry', false);
      });
  }

  function setupAppUpdateCheck() {
    if (!updateButton) {
      return;
    }

    setUpdateUi('Current v' + getCurrentVersion(), 'Check', false);

    updateButton.addEventListener('click', function () {
      if (availableVersion && availableVersion !== getCurrentVersion()) {
        applyAppUpdate();
        return;
      }

      checkForAppUpdate();
    });

    checkForAppUpdate();
  }

  window.addEventListener('load', function () {
    shell = document.querySelector('.messenger-shell');
    thread = document.querySelector('.message-thread');
    header = document.querySelector('.thread-header');
    links = Array.prototype.slice.call(document.querySelectorAll('.conversation-link'));
    backButton = document.querySelector('.thread-back');
    settingsButton = document.querySelector('.settings-button');
    settingsPanel = document.querySelector('.settings-panel');
    notificationButton = document.querySelector('[data-notification-button]');
    updateButton = document.querySelector('[data-update-button]');
    updateStatus = document.querySelector('[data-update-status]');

    registerServiceWorker();

    if (!shell || !thread || !header) {
      return;
    }

    setupConversationLinks();
    setupBackButton();
    setupSettingsPanel();
    setupInfiniteScroll();
    setupHistory();
    setupDeviceStatusPolling();
    setupMessageNotificationPolling();
    setupAppUpdateCheck();
  });
})();
