(function () {
  var mobileQuery = window.matchMedia('(max-width: 820px)');
  var shell = null;
  var conversationPanel = null;
  var conversationList = null;
  var pullRefreshIndicator = null;
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
  var undoToast = null;
  var undoMessage = null;
  var undoButton = null;
  var pendingDelete = null;
  var availableVersion = '';
  var latestNotificationSync = '';
  var pushServerConfigured = true;
  var pushNotificationsEnabled = false;
  var pushErrorMessage = '';
  var isRefreshingContacts = false;
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

  function lockPortraitOrientation() {
    if (!screen.orientation || typeof screen.orientation.lock !== 'function') {
      return;
    }

    screen.orientation.lock('portrait').catch(function () {});
  }

  function getNotificationStorageKey() {
    var deviceCode = shell?.dataset.deviceCode || 'default';

    return 'sms-sync-latest-notification-sync:' + deviceCode;
  }

  function urlBase64ToUint8Array(value) {
    var padding = '='.repeat((4 - value.length % 4) % 4);
    var base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = window.atob(base64);
    var output = new Uint8Array(rawData.length);

    for (var index = 0; index < rawData.length; index += 1) {
      output[index] = rawData.charCodeAt(index);
    }

    return output;
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

  function formatRelativeTime(value) {
    var date = new Date(value);
    var diffSeconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
    var units = [
      { label: 'year', seconds: 31536000 },
      { label: 'month', seconds: 2592000 },
      { label: 'day', seconds: 86400 },
      { label: 'hour', seconds: 3600 },
      { label: 'min', seconds: 60 }
    ];

    for (var index = 0; index < units.length; index += 1) {
      var unit = units[index];

      if (diffSeconds >= unit.seconds) {
        var valueCount = Math.floor(diffSeconds / unit.seconds);
        return valueCount + ' ' + unit.label + (valueCount > 1 && unit.label !== 'min' ? 's' : '') + ' ago';
      }
    }

    return 'just now';
  }

  function getSecondaryText(conversation) {
    var displayName = conversation.displayName || conversation.address || '';
    var secondary = conversation.contactEmail || conversation.address || '';

    return secondary && secondary !== displayName ? secondary : '';
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
          contactEmail: link.dataset.contactEmail || '',
          latestMessageAt: link.dataset.latestMessageAt || ''
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
    var secondary = getSecondaryText(conversation);
    var lastMessageText = conversation.latestMessageAt
      ? 'Last message ' + formatRelativeTime(conversation.latestMessageAt)
      : '';

    header.classList.remove('is-empty');
    avatar.textContent = displayName.slice(0, 1).toUpperCase();
    title.textContent = displayName;
    subtitle.textContent = [secondary, lastMessageText].filter(Boolean).join(' - ');
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
      '<button class="message-delete-button" type="button" data-delete-message="' + escapeHtml(message.id) + '" aria-label="Delete message">Delete</button>',
      '</footer>',
      '</div>',
      '</article>'
    ].join('');
  }

  function renderUnreadDivider() {
    return '<div class="unread-divider" role="separator"><span>Unread</span></div>';
  }

  function renderMessages(messages, unreadStartId) {
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

    var hasDivider = false;
    thread.innerHTML = messages.map(function (message) {
      if (!hasDivider && unreadStartId && message.id === unreadStartId) {
        hasDivider = true;
        return renderUnreadDivider() + renderMessage(message);
      }

      return renderMessage(message);
    }).join('');
  }

  function renderConversationLink(conversation) {
    var displayName = conversation.displayName || conversation.address || 'Unknown';
    var secondary = getSecondaryText(conversation);
    var latestBody = conversation.latestMessage?.body || '';
    var latestMessageAt = conversation.latestMessage?.messageAt || '';
    var unreadCount = Number(conversation.unreadCount) || 0;

    return [
      '<div class="conversation-item" data-address="' + escapeHtml(conversation.address || '') + '">',
      '<button class="conversation-delete-button" type="button" data-delete-conversation="' + escapeHtml(conversation.address || '') + '">Delete</button>',
      '<a',
      ' class="conversation-link"',
      ' href="/?address=' + encodeURIComponent(conversation.address || '') + '"',
      ' data-address="' + escapeHtml(conversation.address || '') + '"',
      ' data-display-name="' + escapeHtml(displayName) + '"',
      ' data-contact-email="' + escapeHtml(conversation.contactEmail || '') + '"',
      ' data-latest-message-at="' + escapeHtml(latestMessageAt) + '">',
      '<span class="avatar" aria-hidden="true">' + escapeHtml(displayName.slice(0, 1).toUpperCase()) + '</span>',
      '<span class="conversation-copy">',
      '<strong>' + escapeHtml(displayName) + '</strong>',
      secondary ? '<em>' + escapeHtml(secondary) + '</em>' : '',
      '<small>' + escapeHtml(latestBody) + '</small>',
      '</span>',
      unreadCount > 0 ? '<span class="unread-badge" data-unread-badge>' + escapeHtml(unreadCount > 99 ? '99+' : unreadCount) + '</span>' : '',
      '</a>',
      '</div>'
    ].join('');
  }

  function renderConversationList(conversations) {
    if (!conversationList) {
      if (conversations.length) {
        window.location.replace('/?refresh=1');
      }

      return;
    }

    conversationList.innerHTML = conversations.map(renderConversationLink).join('');
    links = Array.prototype.slice.call(document.querySelectorAll('.conversation-link'));
    setupConversationLinks();
    setActiveLink(currentAddress);
  }

  function clearUnreadBadge(address) {
    var link = links.find(function (item) {
      return item.dataset.address === address;
    });
    var badge = link?.querySelector('[data-unread-badge]');

    if (badge) {
      badge.remove();
    }
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

  function deleteMessageRequest(id) {
    return fetch('/api/messages/' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: {
        Accept: 'application/json'
      }
    }).then(function (response) {
      if (!response.ok) {
        throw new Error('Message delete failed');
      }

      return response.json();
    });
  }

  function deleteConversationRequest(address) {
    var params = new URLSearchParams({ address: address });

    return fetch('/api/conversations?' + params.toString(), {
      method: 'DELETE',
      headers: {
        Accept: 'application/json'
      }
    }).then(function (response) {
      if (!response.ok) {
        throw new Error('Conversation delete failed');
      }

      return response.json();
    });
  }

  function hideUndoToast() {
    if (undoToast) {
      undoToast.hidden = true;
    }
  }

  function commitPendingDelete() {
    if (!pendingDelete) {
      return;
    }

    var deleteJob = pendingDelete;
    pendingDelete = null;
    window.clearTimeout(deleteJob.timer);
    hideUndoToast();

    deleteJob.commit().catch(function () {
      deleteJob.restore();
      window.alert('Could not delete. Please try again.');
    });
  }

  function scheduleUndoDelete(message, commit, restore) {
    commitPendingDelete();

    pendingDelete = {
      commit: commit,
      restore: restore,
      timer: window.setTimeout(commitPendingDelete, 5000)
    };

    if (undoMessage) {
      undoMessage.textContent = message;
    }

    if (undoToast) {
      undoToast.hidden = false;
    }
  }

  function undoPendingDelete() {
    if (!pendingDelete) {
      return;
    }

    var deleteJob = pendingDelete;
    pendingDelete = null;
    window.clearTimeout(deleteJob.timer);
    deleteJob.restore();
    hideUndoToast();
  }

  function refreshConversationList() {
    if (isRefreshingContacts) {
      return Promise.resolve();
    }

    isRefreshingContacts = true;

    if (pullRefreshIndicator) {
      pullRefreshIndicator.hidden = false;
      pullRefreshIndicator.classList.add('is-visible', 'is-refreshing');
    }

    return fetch('/api/conversations?ts=' + Date.now(), {
      cache: 'no-store',
      headers: {
        Accept: 'application/json'
      }
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Refresh failed');
        }

        return response.json();
      })
      .then(function (data) {
        renderConversationList(data.conversations || []);

        if (data.latestSyncedAt) {
          shell.dataset.latestSync = data.latestSyncedAt;
          latestNotificationSync = data.latestSyncedAt;
          window.localStorage.setItem(getNotificationStorageKey(), latestNotificationSync);
        }

        if (currentAddress) {
          openConversation(currentAddress, {
            pushState: false
          });
        }
      })
      .catch(function () {})
      .finally(function () {
        isRefreshingContacts = false;

        if (pullRefreshIndicator) {
          pullRefreshIndicator.classList.remove('is-refreshing');
          window.setTimeout(function () {
            pullRefreshIndicator.classList.remove('is-visible');
            pullRefreshIndicator.hidden = true;
          }, 220);
        }
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
        if ((data.messages || []).length) {
          currentConversation.latestMessageAt = data.messages[data.messages.length - 1].messageAt;
          renderHeader(currentConversation);
        }
        renderMessages(data.messages || [], data.unreadStartId || null);
        clearUnreadBadge(address);
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
      if (link.dataset.bound === 'true') {
        return;
      }

      link.dataset.bound = 'true';
      link.addEventListener('click', function (event) {
        event.preventDefault();
        openConversation(link.dataset.address || '');
      });
    });
  }

  function deleteMessageWithUndo(button) {
    var id = button.dataset.deleteMessage || '';
    var row = button.closest('.bubble-row');

    if (!id || !row || !window.confirm('Delete this message?')) {
      return;
    }

    var parent = row.parentNode;
    var nextSibling = row.nextSibling;

    row.remove();
    scheduleUndoDelete(
      'Message deleted',
      function () {
        return deleteMessageRequest(id).then(function () {
          refreshConversationList();
        });
      },
      function () {
        parent.insertBefore(row, nextSibling);
      }
    );
  }

  function deleteConversationWithUndo(address, item) {
    if (!address || !item || !window.confirm('Delete this full thread?')) {
      return;
    }

    var parent = item.parentNode;
    var nextSibling = item.nextSibling;
    var wasCurrent = currentAddress === address;

    item.remove();

    if (wasCurrent) {
      closeConversation();
    }

    scheduleUndoDelete(
      'Thread deleted',
      function () {
        return deleteConversationRequest(address).then(function () {
          refreshConversationList();
        });
      },
      function () {
        parent.insertBefore(item, nextSibling);
        links = Array.prototype.slice.call(document.querySelectorAll('.conversation-link'));
        setupConversationLinks();
        setActiveLink(currentAddress);
      }
    );
  }

  function setupMessageDeletes() {
    thread.addEventListener('click', function (event) {
      var button = event.target.closest('[data-delete-message]');

      if (button) {
        event.preventDefault();
        deleteMessageWithUndo(button);
      }
    });
  }

  function setupConversationDeletes() {
    if (!conversationPanel) {
      return;
    }

    conversationPanel.addEventListener('click', function (event) {
      var button = event.target.closest('[data-delete-conversation]');

      if (!button) {
        return;
      }

      event.preventDefault();
      deleteConversationWithUndo(button.dataset.deleteConversation || '', button.closest('.conversation-item'));
    });

    var startX = 0;
    var startY = 0;
    var activeItem = null;

    conversationPanel.addEventListener('touchstart', function (event) {
      var link = event.target.closest('.conversation-link');

      if (!link || !event.touches.length) {
        return;
      }

      activeItem = link.closest('.conversation-item');
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    }, { passive: true });

    conversationPanel.addEventListener('touchend', function (event) {
      if (!activeItem || !event.changedTouches.length) {
        activeItem = null;
        return;
      }

      var diffX = event.changedTouches[0].clientX - startX;
      var diffY = event.changedTouches[0].clientY - startY;

      if (Math.abs(diffX) > 48 && Math.abs(diffX) > Math.abs(diffY) * 1.4) {
        Array.prototype.slice.call(document.querySelectorAll('.conversation-item.is-delete-open')).forEach(function (item) {
          if (item !== activeItem) {
            item.classList.remove('is-delete-open');
          }
        });

        activeItem.classList.toggle('is-delete-open', diffX < 0);
      }

      activeItem = null;
    }, { passive: true });
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
    var params = new URLSearchParams(window.location.search);
    var address = params.get('address');

    window.history.replaceState({
      smsSyncView: address ? 'thread' : 'contacts',
      address: address || ''
    }, '', window.location.pathname + window.location.search);

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

    if (address) {
      openConversation(address, {
        pushState: false
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

  function setupPullToRefresh() {
    if (!conversationPanel || !conversationList || !pullRefreshIndicator) {
      return;
    }

    var startY = 0;
    var pullDistance = 0;
    var isPulling = false;

    conversationPanel.addEventListener('touchstart', function (event) {
      if (!mobileQuery.matches || !event.touches.length || shell.classList.contains('is-thread-open')) {
        return;
      }

      if (conversationList.scrollTop > 0) {
        return;
      }

      startY = event.touches[0].clientY;
      pullDistance = 0;
      isPulling = true;
    }, { passive: true });

    conversationPanel.addEventListener('touchmove', function (event) {
      if (!isPulling || !event.touches.length) {
        return;
      }

      pullDistance = Math.max(0, event.touches[0].clientY - startY);

      if (pullDistance <= 0) {
        return;
      }

      if (pullDistance > 12) {
        event.preventDefault();
      }

      pullRefreshIndicator.hidden = false;
      pullRefreshIndicator.classList.add('is-visible');
      pullRefreshIndicator.style.transform = 'translate(-50%, ' + Math.min(pullDistance * 0.45, 56) + 'px)';
    }, { passive: false });

    conversationPanel.addEventListener('touchend', function () {
      if (!isPulling) {
        return;
      }

      isPulling = false;
      pullRefreshIndicator.style.transform = '';

      if (pullDistance >= 72) {
        refreshConversationList();
        return;
      }

      pullRefreshIndicator.classList.remove('is-visible');
      pullRefreshIndicator.hidden = true;
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

  function fetchPushPublicKey() {
    return fetch('/api/push/public-key?ts=' + Date.now(), {
      cache: 'no-store',
      headers: {
        Accept: 'application/json'
      }
    }).then(function (response) {
      if (!response.ok) {
        throw new Error('Push key request failed');
      }

      return response.json();
    });
  }

  function savePushSubscription(subscription) {
    return fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subscription: subscription.toJSON()
      })
    }).then(function (response) {
      if (!response.ok) {
        throw new Error('Push subscribe failed');
      }

      return response.json();
    });
  }

  function ensurePushSubscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      pushNotificationsEnabled = false;
      return Promise.resolve(false);
    }

    return fetchPushPublicKey()
      .then(function (data) {
        if (!data.enabled || !data.publicKey) {
          pushServerConfigured = false;
          pushNotificationsEnabled = false;
          pushErrorMessage = 'Server VAPID keys are missing.';
          return false;
        }

        pushServerConfigured = true;
        pushErrorMessage = '';
        return navigator.serviceWorker.ready
          .then(function (registration) {
            return registration.pushManager.getSubscription()
              .then(function (subscription) {
                return subscription || registration.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: urlBase64ToUint8Array(data.publicKey)
                });
              });
          })
          .then(function (subscription) {
            return savePushSubscription(subscription);
          })
          .then(function () {
            pushNotificationsEnabled = true;
            pushErrorMessage = '';
            return true;
          });
      })
      .catch(function (err) {
        pushNotificationsEnabled = false;
        pushErrorMessage = err?.message || 'Push subscription failed.';
        return false;
      });
  }

  function updateNotificationButton() {
    if (!notificationButton) {
      return;
    }

    notificationButton.disabled = false;
    notificationButton.removeAttribute('title');

    if (!('Notification' in window)) {
      notificationButton.textContent = 'Unsupported';
      notificationButton.disabled = true;
      notificationButton.title = 'This browser does not support web notifications.';
      return;
    }

    if (!window.isSecureContext) {
      notificationButton.textContent = 'Needs HTTPS';
      notificationButton.disabled = true;
      notificationButton.title = 'Notifications require HTTPS or localhost.';
      return;
    }

    if (Notification.permission === 'granted') {
      if (!pushServerConfigured) {
        notificationButton.textContent = 'Setup Push';
        notificationButton.title = pushErrorMessage || 'Server VAPID keys are missing, so closed-app notifications cannot start yet.';
        return;
      }

      notificationButton.textContent = pushNotificationsEnabled ? 'Test' : 'Enable Push';
      notificationButton.title = pushNotificationsEnabled
        ? 'Send a real server push test notification.'
        : (pushErrorMessage || 'Enable background notifications for this installed web app.');
      return;
    }

    if (Notification.permission === 'denied') {
      notificationButton.textContent = 'Blocked';
      notificationButton.title = 'Enable notifications in browser or system settings, then press this again.';
      return;
    }

    notificationButton.textContent = 'Allow';
    notificationButton.title = 'Ask this browser for notification permission.';
  }

  function displayNotification(title, options) {
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

  function showTestNotification() {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    if (pushNotificationsEnabled) {
      notificationButton.disabled = true;
      notificationButton.textContent = 'Sending';

      fetch('/api/push/test', {
        method: 'POST',
        headers: {
          Accept: 'application/json'
        }
      })
        .then(function (response) {
          return response.json().then(function (data) {
            if (!response.ok) {
              throw new Error(data.error || 'Server push test failed.');
            }

            return data;
          });
        })
        .then(function () {
          updateNotificationButton();
        })
        .catch(function (err) {
          pushNotificationsEnabled = false;
          pushErrorMessage = err.message || 'Server push test failed.';
          window.alert(pushErrorMessage);
          updateNotificationButton();
        });
      return;
    }

    displayNotification('SMS Sync notifications are on', {
      body: 'New SMS alerts will appear here.',
      icon: '/icons/icon-192.png',
      badge: '/icons/maskable-512.png',
      tag: 'sms-sync-test',
      renotify: true,
      data: {
        url: '/'
      }
    });
  }

  function requestNotificationPermission() {
    if (!('Notification' in window)) {
      return;
    }

    if (Notification.permission === 'granted') {
      ensurePushSubscription().then(function (enabled) {
        if (enabled) {
          showTestNotification();
        } else if (pushErrorMessage) {
          window.alert(pushErrorMessage);
        }

        updateNotificationButton();
      });
      return;
    }

    if (Notification.permission === 'denied') {
      window.alert('Notifications are blocked for this site. Enable them in your browser or system notification settings, then come back and press the notification button again.');
      updateNotificationButton();
      return;
    }

    Notification.requestPermission().then(function (permission) {
      if (permission === 'granted') {
        ensurePushSubscription().then(function (enabled) {
          if (enabled) {
            showTestNotification();
          } else if (pushErrorMessage) {
            window.alert(pushErrorMessage);
          }

          updateNotificationButton();
        });
        return;
      }

      updateNotificationButton();
    });
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

    displayNotification(title, options);
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
          refreshConversationList();

          if (!pushNotificationsEnabled) {
            showMessageNotification(messages);
          }
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

    if ('Notification' in window && Notification.permission === 'granted') {
      ensurePushSubscription().then(updateNotificationButton);
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

  function handleRefreshUrl(url) {
    var parsedUrl = new URL(url || window.location.href, window.location.origin);
    var address = parsedUrl.searchParams.get('address');

    return refreshConversationList().then(function () {
      if (address) {
        openConversation(address, {
          pushState: false
        });
      }
    });
  }

  function setupNotificationRefreshHandling() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', function (event) {
        if (event.data?.type === 'SMS_SYNC_REFRESH') {
          handleRefreshUrl(event.data.url);
        }
      });
    }

    var params = new URLSearchParams(window.location.search);

    if (params.get('refresh') === '1') {
      params.delete('refresh');
      window.history.replaceState(window.history.state || {
        smsSyncView: params.get('address') ? 'thread' : 'contacts'
      }, '', window.location.pathname + (params.toString() ? '?' + params.toString() : ''));
      window.setTimeout(function () {
        handleRefreshUrl(window.location.href);
      }, 150);
    }
  }

  function setupRelativeTimeRefresh() {
    window.setInterval(function () {
      if (currentConversation) {
        renderHeader(currentConversation);
      }
    }, 60000);
  }

  window.addEventListener('load', function () {
    shell = document.querySelector('.messenger-shell');
    conversationPanel = document.querySelector('.conversation-panel');
    conversationList = document.querySelector('.conversation-list');
    pullRefreshIndicator = document.querySelector('[data-pull-refresh]');
    thread = document.querySelector('.message-thread');
    header = document.querySelector('.thread-header');
    links = Array.prototype.slice.call(document.querySelectorAll('.conversation-link'));
    backButton = document.querySelector('.thread-back');
    settingsButton = document.querySelector('.settings-button');
    settingsPanel = document.querySelector('.settings-panel');
    notificationButton = document.querySelector('[data-notification-button]');
    updateButton = document.querySelector('[data-update-button]');
    updateStatus = document.querySelector('[data-update-status]');
    undoToast = document.querySelector('[data-undo-toast]');
    undoMessage = document.querySelector('[data-undo-message]');
    undoButton = document.querySelector('[data-undo-button]');

    registerServiceWorker();
    lockPortraitOrientation();

    if (!shell || !thread || !header) {
      return;
    }

    setupConversationLinks();
    setupBackButton();
    setupConversationDeletes();
    setupMessageDeletes();
    setupSettingsPanel();
    setupInfiniteScroll();
    setupPullToRefresh();
    setupHistory();
    setupDeviceStatusPolling();
    setupMessageNotificationPolling();
    setupAppUpdateCheck();
    setupNotificationRefreshHandling();
    setupRelativeTimeRefresh();

    if (undoButton) {
      undoButton.addEventListener('click', undoPendingDelete);
    }
  });
})();
