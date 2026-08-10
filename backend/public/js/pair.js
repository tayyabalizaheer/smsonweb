(function () {
  var timer = document.querySelector('[data-pair-expires-at]');
  var countdown = document.querySelector('[data-pair-countdown]');
  var optionButtons = Array.prototype.slice.call(document.querySelectorAll('.pair-options button'));

  if (!timer || !countdown || !optionButtons.length) {
    return;
  }

  var expiresAt = new Date(timer.dataset.pairExpiresAt).getTime();

  function tick() {
    var secondsLeft = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));

    countdown.textContent = String(secondsLeft);

    if (secondsLeft <= 0) {
      timer.classList.add('is-expired');
      timer.innerHTML = 'Verification expired. Enter the 6 digit code again.';
      optionButtons.forEach(function (button) {
        button.disabled = true;
      });
      window.clearInterval(interval);
    }
  }

  var interval = window.setInterval(tick, 250);
  tick();
})();
