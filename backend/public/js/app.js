(function () {
  var mobileQuery = window.matchMedia('(max-width: 820px)');
  var shell = null;
  var thread = null;
  var header = null;
  var links = [];
  var backButton = null;
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

    navigator.serviceWorker.register('/sw.js').catch(function (err) {
      console.error('Service worker registration failed:', err);
    });
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

  window.addEventListener('load', function () {
    shell = document.querySelector('.messenger-shell');
    thread = document.querySelector('.message-thread');
    header = document.querySelector('.thread-header');
    links = Array.prototype.slice.call(document.querySelectorAll('.conversation-link'));
    backButton = document.querySelector('.thread-back');

    registerServiceWorker();

    if (!shell || !thread || !header) {
      return;
    }

    setupConversationLinks();
    setupBackButton();
    setupInfiniteScroll();
    setupHistory();
  });
})();
