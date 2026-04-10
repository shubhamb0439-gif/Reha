(function () {
  var hiddenVoice = document.getElementById('btnVoice');
  var hiddenConnect = document.getElementById('btnConnect');
  var hiddenStream = document.getElementById('btnStream');

  var orbBtn = document.getElementById('hcOrbBtn');
  var playBtn = document.getElementById('hcPlayBtn');
  var msgBtn = document.getElementById('hcMsgBtn');

  var streamOrbBtn = document.getElementById('hcStreamOrbBtn');
  var streamPlayBtn = document.getElementById('hcStreamPlayBtn');
  var streamMsgBtn = document.getElementById('hcStreamMsgBtn');

  var msgOrbBtn = document.getElementById('hcMsgOrbBtn');
  var msgPlayBtn = document.getElementById('hcMsgPlayBtn');
  var msgMsgBtn = document.getElementById('hcMsgMsgBtn');

  var hcStreamPopup = document.getElementById('hcStreamPopup');
  var hcMsgPopup = document.getElementById('hcMsgPopup');

  var _streamActive = false;

  function isStreamActive() {
    var btn = document.getElementById('manualStreamBtn');
    if (btn) return btn.classList.contains('active');
    return _streamActive;
  }

  function startStream() {
    if (!isStreamActive()) {
      if (hiddenStream) hiddenStream.click();
      _streamActive = true;
    }
  }

  function stopStream() {
    if (isStreamActive()) {
      if (hiddenStream) hiddenStream.click();
      _streamActive = false;
    }
  }

  function openStreamPopup() {
    if (hcStreamPopup) hcStreamPopup.classList.add('show');
    moveVideoToStreamPopup();
    startStreamWaveAnimation();
  }

  function closeStreamPopup() {
    if (hcStreamPopup) hcStreamPopup.classList.remove('show');
    returnVideoFromStreamPopup();
    stopStreamWaveAnimation();
    if (hcSoloTranscript) hcSoloTranscript.classList.remove('show');
  }

  function openMsgPopup() {
    if (hcMsgPopup) hcMsgPopup.classList.add('show');
  }

  function closeMsgPopup() {
    if (hcMsgPopup) hcMsgPopup.classList.remove('show');
  }

  var hcProfileToggle = document.getElementById('hcProfileToggle');
  var hcProfilePopup = document.getElementById('hcProfilePopup');
  var hcPopupOverlay = document.getElementById('hcPopupOverlay');
  var hcPopupConnect = document.getElementById('hcPopupConnect');

  var hcWaveCanvas = document.getElementById('hcWaveCanvas');
  var hcTranscriptCurrent = document.getElementById('hcTranscriptCurrent');
  var hcTranscriptPrev = document.getElementById('hcTranscriptPrev');
  var hcTranscriptNext = document.getElementById('hcTranscriptNext');
  var hcSummaryDisplay = document.getElementById('hcSummaryDisplay');
  var hcSummaryText = document.getElementById('hcSummaryText');

  var hcHomeWave = document.getElementById('hcHomeWave');
  var hcHomeWaveCanvas = document.getElementById('hcHomeWaveCanvas');
  var hcHomeContent = document.getElementById('hcHomeContent');

  var hcDoctorName = document.getElementById('hcDoctorName');
  var hcStreamDoctorName = document.getElementById('hcStreamDoctorName');
  var hcMsgDoctorName = document.getElementById('hcMsgDoctorName');
  var hcPopupName = document.getElementById('hcPopupName');
  var hcProfileCircle = document.getElementById('hcProfileCircle');
  var hcStreamProfileCircle = document.getElementById('hcStreamProfileCircle');
  var hcMsgProfileCircle = document.getElementById('hcMsgProfileCircle');
  var hcPopupScribeName = document.getElementById('hcPopupScribeName');
  var hcPopupScribeBadge = document.getElementById('hcPopupScribeBadge');

  var hcSoloTranscript = document.getElementById('hcSoloTranscript');
  var hcSoloTranscriptCurrent = document.getElementById('hcSoloTranscriptCurrent');
  var hcSoloTranscriptPrev = document.getElementById('hcSoloTranscriptPrev');
  var hcSoloTranscriptNext = document.getElementById('hcSoloTranscriptNext');

  var hcStreamMuteBtn = document.getElementById('hcStreamMuteBtn');
  var hcStreamHideBtn = document.getElementById('hcStreamHideBtn');
  var hcStreamPauseBtn = document.getElementById('hcStreamPauseBtn');

  var hcMsgInput = document.getElementById('hcMsgInput');
  var hcMsgSendBtn = document.getElementById('hcMsgSendBtn');
  var hcRecentMsgContent = document.getElementById('hcRecentMsgContent');
  var hcMsgHistoryContent = document.getElementById('hcMsgHistoryContent');

  var homeWaveAnimFrame = null;
  var homeWaveCtx = hcHomeWaveCanvas ? hcHomeWaveCanvas.getContext('2d') : null;

  function startHomeWaveAnimation() {
    if (!hcHomeWaveCanvas || !homeWaveCtx) return;
    if (homeWaveAnimFrame) return;

    var W = hcHomeWaveCanvas.width;
    var H = hcHomeWaveCanvas.height;
    var t = 0;

    function drawFrame() {
      homeWaveCtx.clearRect(0, 0, W, H);
      t++;

      var xrCanvas = window._xrCanvas;
      var hasLive = xrCanvas && xrCanvas.analyser && xrCanvas.listening && xrCanvas.dataArr;
      var amp = 0;

      if (hasLive) {
        xrCanvas.analyser.getByteTimeDomainData(xrCanvas.dataArr);
        var rms = 0;
        for (var i = 0; i < xrCanvas.dataArr.length; i++) {
          var v = (xrCanvas.dataArr[i] / 128) - 1;
          rms += v * v;
        }
        amp = Math.min(Math.sqrt(rms / xrCanvas.dataArr.length) * 7, 1);
      }

      var cy = H * 0.5;
      var N = 380;
      var idle = Math.max(0, 1 - amp * 1.5);

      var layers = [
        { r: 167, g: 139, b: 250, lw: 2.0, glow: 22, al: 0.95 },
        { r: 139, g: 92, b: 246, lw: 1.5, glow: 15, al: 0.54 },
        { r: 192, g: 132, b: 252, lw: 0.95, glow: 9, al: 0.27 }
      ];

      for (var li = 0; li < layers.length; li++) {
        var L = layers[li];
        var phOff = li * 1.2;
        var spd = 1 - li * 0.08;
        var xs = new Float32Array(N + 1);
        var ys = new Float32Array(N + 1);

        for (var i = 0; i <= N; i++) {
          var u = i / N;
          var ph = t * 0.011 * spd + phOff;
          var bA = H * (0.088 + li * 0.003);
          var idY =
            Math.sin(u * Math.PI * 2 * 2.2 + ph) * bA * 0.62 +
            Math.sin(u * Math.PI * 2 * 1.1 + ph * 0.70) * bA * 0.44 +
            Math.sin(u * Math.PI * 2 * 0.52 + ph * 0.36) * bA * 0.20;
          var micY = 0;
          if (hasLive && xrCanvas.dataArr) {
            var idx = Math.floor(u * (xrCanvas.dataArr.length - 1));
            var val = (xrCanvas.dataArr[idx] / 128) - 1;
            micY = val * H * 0.38 * amp + Math.sin(u * Math.PI * 2 * 2.2 + ph) * H * 0.05 * amp;
          }
          var total = idY * idle + (idY * 0.2 + micY) * amp;
          xs[i] = u * W;
          ys[i] = cy + total * Math.sin(u * Math.PI);
        }

        var makePath = function () {
          homeWaveCtx.beginPath();
          homeWaveCtx.moveTo(xs[0], ys[0]);
          for (var j = 1; j <= N; j++) homeWaveCtx.lineTo(xs[j], ys[j]);
        };

        var mkGrad = function (a) {
          var g = homeWaveCtx.createLinearGradient(0, 0, W, 0);
          g.addColorStop(0, 'rgba(' + L.r + ',' + L.g + ',' + L.b + ',0)');
          g.addColorStop(0.07, 'rgba(' + L.r + ',' + L.g + ',' + L.b + ',' + a + ')');
          g.addColorStop(0.50, 'rgba(' + L.r + ',' + L.g + ',' + L.b + ',' + Math.min(a * 1.1, 1) + ')');
          g.addColorStop(0.93, 'rgba(' + L.r + ',' + L.g + ',' + L.b + ',' + a + ')');
          g.addColorStop(1, 'rgba(' + L.r + ',' + L.g + ',' + L.b + ',0)');
          return g;
        };

        homeWaveCtx.lineJoin = 'round';
        homeWaveCtx.lineCap = 'round';

        makePath();
        homeWaveCtx.lineWidth = L.lw * 11;
        homeWaveCtx.strokeStyle = mkGrad(L.al * 0.09);
        homeWaveCtx.shadowBlur = 0;
        homeWaveCtx.stroke();

        makePath();
        homeWaveCtx.lineWidth = L.lw * 3.8;
        homeWaveCtx.strokeStyle = mkGrad(L.al * 0.43);
        homeWaveCtx.shadowColor = 'rgba(' + L.r + ',' + L.g + ',' + L.b + ',0.88)';
        homeWaveCtx.shadowBlur = L.glow;
        homeWaveCtx.stroke();

        makePath();
        homeWaveCtx.lineWidth = L.lw;
        homeWaveCtx.strokeStyle = mkGrad(L.al);
        homeWaveCtx.shadowColor = 'rgba(' + L.r + ',' + L.g + ',' + L.b + ',1)';
        homeWaveCtx.shadowBlur = L.glow * 0.45;
        homeWaveCtx.stroke();
      }

      homeWaveCtx.shadowBlur = 0;
      homeWaveAnimFrame = requestAnimationFrame(drawFrame);
    }

    drawFrame();
  }

  function stopHomeWaveAnimation() {
    if (homeWaveAnimFrame) {
      cancelAnimationFrame(homeWaveAnimFrame);
      homeWaveAnimFrame = null;
    }
    if (homeWaveCtx && hcHomeWaveCanvas) {
      homeWaveCtx.clearRect(0, 0, hcHomeWaveCanvas.width, hcHomeWaveCanvas.height);
    }
  }

  function setHomeMicActive(active) {
    if (active) {
      if (hcHomeContent) hcHomeContent.classList.add('hidden');
      if (hcHomeWave) hcHomeWave.classList.add('show');
      startHomeWaveAnimation();
    } else {
      if (hcHomeContent) hcHomeContent.classList.remove('hidden');
      if (hcHomeWave) hcHomeWave.classList.remove('show');
      stopHomeWaveAnimation();
    }
  }

  var waveAnimFrame = null;
  var waveCtx = hcWaveCanvas ? hcWaveCanvas.getContext('2d') : null;

  function startStreamWaveAnimation() {
    if (!hcWaveCanvas || !waveCtx) return;
    if (waveAnimFrame) return;
    var W = hcWaveCanvas.width;
    var H = hcWaveCanvas.height;
    var t = 0;

    function draw() {
      waveCtx.clearRect(0, 0, W, H);
      t++;
      var xrCanvas = window._xrCanvas;
      var hasLive = xrCanvas && xrCanvas.analyser && xrCanvas.listening && xrCanvas.dataArr;
      var amp = 0;
      if (hasLive) {
        xrCanvas.analyser.getByteTimeDomainData(xrCanvas.dataArr);
        var rms = 0;
        for (var i = 0; i < xrCanvas.dataArr.length; i++) {
          var v = (xrCanvas.dataArr[i] / 128) - 1;
          rms += v * v;
        }
        amp = Math.min(Math.sqrt(rms / xrCanvas.dataArr.length) * 7, 1);
      }
      var cy = H * 0.5;
      for (var x = 0; x <= W; x++) {
        var u = x / W;
        var y = cy + Math.sin(u * Math.PI * 4 + t * 0.03) * H * 0.3 * (0.3 + amp * 0.7) * Math.sin(u * Math.PI);
        waveCtx.fillStyle = 'rgba(167,139,250,' + (0.6 + amp * 0.4) + ')';
        waveCtx.fillRect(x, y, 1.5, 1.5);
      }
      waveAnimFrame = requestAnimationFrame(draw);
    }
    draw();
  }

  function stopStreamWaveAnimation() {
    if (waveAnimFrame) {
      cancelAnimationFrame(waveAnimFrame);
      waveAnimFrame = null;
    }
  }

  function syncOrbState(active) {
    var allOrbs = [orbBtn, streamOrbBtn, msgOrbBtn];
    allOrbs.forEach(function (b) {
      if (!b) return;
      if (active) b.classList.add('active');
      else b.classList.remove('active');
    });
    setHomeMicActive(active);
  }

  function isVoiceActive() {
    return orbBtn ? orbBtn.classList.contains('active') : false;
  }

  if (orbBtn) {
    orbBtn.addEventListener('click', function () {
      var willBeActive = !isVoiceActive();
      if (hiddenVoice) hiddenVoice.click();
      syncOrbState(willBeActive);
    });
  }

  function moveVideoToStreamPopup() {
    var preview = document.getElementById('preview');
    var wrap = document.getElementById('hcStreamVideoWrap');
    if (preview && wrap && !wrap.contains(preview)) {
      preview.hidden = false;
      preview.style.display = 'block';
      wrap.appendChild(preview);
    }
  }

  function returnVideoFromStreamPopup() {
    var preview = document.getElementById('preview');
    var wrap = document.getElementById('hcStreamVideoWrap');
    var shell = document.getElementById('shell');
    if (preview && shell && wrap && wrap.contains(preview)) {
      preview.hidden = true;
      preview.style.display = '';
      shell.appendChild(preview);
    }
  }

  if (playBtn) {
    playBtn.addEventListener('click', function () {
      startStream();
      openStreamPopup();
    });
  }

  if (msgBtn) {
    msgBtn.addEventListener('click', function () {
      openMsgPopup();
    });
  }

  if (streamOrbBtn) {
    streamOrbBtn.addEventListener('click', function () {
      var willBeActive = !isVoiceActive();
      if (hiddenVoice) hiddenVoice.click();
      syncOrbState(willBeActive);
    });
  }

  if (streamPlayBtn) {
    streamPlayBtn.addEventListener('click', function () {
      stopStream();
      closeStreamPopup();
    });
  }

  if (streamMsgBtn) {
    streamMsgBtn.addEventListener('click', function () {
      closeStreamPopup();
      openMsgPopup();
    });
  }

  if (msgOrbBtn) {
    msgOrbBtn.addEventListener('click', function () {
      var willBeActive = !isVoiceActive();
      if (hiddenVoice) hiddenVoice.click();
      syncOrbState(willBeActive);
    });
  }

  if (msgPlayBtn) {
    msgPlayBtn.addEventListener('click', function () {
      closeMsgPopup();
      startStream();
      openStreamPopup();
    });
  }

  if (msgMsgBtn) {
    msgMsgBtn.addEventListener('click', function () {
      closeMsgPopup();
    });
  }

  if (hcProfileToggle) {
    hcProfileToggle.addEventListener('click', function () {
      if (hcProfilePopup) hcProfilePopup.classList.toggle('show');
      if (hcPopupOverlay) hcPopupOverlay.classList.toggle('show');
    });
  }

  if (hcPopupOverlay) {
    hcPopupOverlay.addEventListener('click', function () {
      if (hcProfilePopup) hcProfilePopup.classList.remove('show');
      if (hcPopupOverlay) hcPopupOverlay.classList.remove('show');
    });
  }

  if (hcPopupConnect) {
    hcPopupConnect.addEventListener('click', function () {
      if (hiddenConnect) hiddenConnect.click();
    });
  }

  if (hcStreamMuteBtn) {
    hcStreamMuteBtn.addEventListener('click', function () {
      var hiddenMute = document.getElementById('btnMute');
      if (hiddenMute) hiddenMute.click();
      hcStreamMuteBtn.classList.toggle('active');
      hcStreamMuteBtn.textContent = hcStreamMuteBtn.classList.contains('active') ? 'Unmute' : 'Mute';
    });
  }

  if (hcStreamHideBtn) {
    hcStreamHideBtn.addEventListener('click', function () {
      var hiddenVideo = document.getElementById('btnVideo');
      if (hiddenVideo) hiddenVideo.click();
      hcStreamHideBtn.classList.toggle('active');
      hcStreamHideBtn.textContent = hcStreamHideBtn.classList.contains('active') ? 'Show' : 'Hide';
    });
  }

  if (hcStreamPauseBtn) {
    hcStreamPauseBtn.addEventListener('click', function () {
      hcStreamPauseBtn.classList.toggle('active');
      hcStreamPauseBtn.textContent = hcStreamPauseBtn.classList.contains('active') ? 'Resume' : 'Pause';
    });
  }

  if (hcMsgSendBtn && hcMsgInput) {
    hcMsgSendBtn.addEventListener('click', function () {
      var text = (hcMsgInput.value || '').trim();
      if (!text) return;
      var hiddenMsgInput = document.getElementById('msgInput');
      var hiddenSend = document.getElementById('btnSend');
      if (hiddenMsgInput) hiddenMsgInput.value = text;
      if (hiddenSend) hiddenSend.click();
      hcMsgInput.value = '';
    });

    hcMsgInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        hcMsgSendBtn.click();
      }
    });
  }

  function syncDoctorInfo() {
    try {
      var xrId = window.XR_DEVICE_ID || '';
      var xrDisplay = document.getElementById('xrIdDisplay');
      var displayName = (xrDisplay && xrDisplay.value) || xrId || '';

      if (hcDoctorName) hcDoctorName.textContent = displayName;
      if (hcStreamDoctorName) hcStreamDoctorName.textContent = displayName;
      if (hcMsgDoctorName) hcMsgDoctorName.textContent = displayName;
      if (hcPopupName) hcPopupName.textContent = displayName || 'Doctor';

      var statusEl = document.getElementById('status');
      var isConnected = statusEl && statusEl.textContent.indexOf('Connected') > -1 && statusEl.textContent.indexOf('Disconnected') === -1;

      if (hcProfileCircle) hcProfileCircle.classList.toggle('disconnected', !isConnected);
      if (hcStreamProfileCircle) hcStreamProfileCircle.classList.toggle('disconnected', !isConnected);
      if (hcMsgProfileCircle) hcMsgProfileCircle.classList.toggle('disconnected', !isConnected);

      if (hcPopupConnect) {
        if (isConnected) {
          hcPopupConnect.textContent = 'Disconnect';
          hcPopupConnect.classList.add('connected');
        } else {
          hcPopupConnect.textContent = 'Connect';
          hcPopupConnect.classList.remove('connected');
        }
      }

      var peerStatusEl = document.getElementById('peerStatusText');
      if (hcPopupScribeName && peerStatusEl) {
        var peerText = peerStatusEl.textContent || '';
        var scribeName = peerText.replace(' is Online', '').replace(' is Offline', '').trim();
        if (scribeName && scribeName !== 'Peer') {
          hcPopupScribeName.textContent = scribeName;
          var isOnline = peerText.indexOf('Online') > -1;
          if (hcPopupScribeBadge) {
            hcPopupScribeBadge.textContent = isOnline ? 'Online' : 'Offline';
            hcPopupScribeBadge.className = 'status-badge ' + (isOnline ? 'online' : 'offline');
          }
        }
      }
    } catch (e) {}
  }

  setInterval(syncDoctorInfo, 1000);
  setTimeout(syncDoctorInfo, 500);

  window._hcOpenStreamPopup = openStreamPopup;
  window._hcCloseStreamPopup = closeStreamPopup;
  window._hcOpenMsgPopup = openMsgPopup;

  var _lastStreamBtnState = false;
  function watchStreamBtnState() {
    var btn = document.getElementById('manualStreamBtn');
    if (!btn) return;
    var nowActive = btn.classList.contains('active');
    if (nowActive !== _lastStreamBtnState) {
      _lastStreamBtnState = nowActive;
      _streamActive = nowActive;
      if (nowActive && !hcStreamPopup.classList.contains('show') && !hcMsgPopup.classList.contains('show')) {
        openStreamPopup();
      }
    }
    var voiceActive = typeof isListening !== 'undefined' ? isListening : false;
    var orbShouldBeActive = orbBtn ? orbBtn.classList.contains('active') : false;
    if (window._hcVoiceActive !== undefined && window._hcVoiceActive !== orbShouldBeActive) {
      syncOrbState(window._hcVoiceActive);
    }
  }
  setInterval(watchStreamBtnState, 300);

  window.addEventListener('DOMContentLoaded', function() {
    syncTranscripts();
  });

  function parseMsgElement(el) {
    var sender = '';
    var time = '';
    var text = '';
    var senderEl = el.querySelector('.msg-header');
    var timeEl = el.querySelector('.msg-timestamp');
    var textEl = el.querySelector('.msg-text');
    if (senderEl) sender = senderEl.textContent.trim();
    if (timeEl) time = timeEl.textContent.trim();
    if (textEl) text = textEl.textContent.trim();
    return { sender: sender, time: time, text: text };
  }

  var currentReplyTarget = null;

  function isSystemMessage(parsed) {
    var senderLower = (parsed.sender || '').toLowerCase().trim();
    return senderLower === 'system' || senderLower === 'voice' || senderLower === '';
  }

  function makeReplyBtn(parsed) {
    var btn = document.createElement('button');
    btn.className = 'hc-msg-reply-btn';
    btn.textContent = 'Reply';
    btn.addEventListener('click', function () {
      currentReplyTarget = parsed.sender;
      if (hcMsgInput) {
        hcMsgInput.focus();
        hcMsgInput.placeholder = 'Replying to ' + parsed.sender + '...';
      }
    });
    return btn;
  }

  function makeMsgItem(parsed) {
    var div = document.createElement('div');
    div.className = 'hc-msg-item';
    var header = '<div class="hc-msg-item-header">';
    header += '<span class="hc-msg-sender">' + parsed.sender + '</span>';
    header += '</div>';
    var body = '';
    if (parsed.time) {
      body += '<div class="hc-msg-time-stamp">' + parsed.time + '</div>';
    }
    if (parsed.text) {
      body += '<div class="hc-msg-text">' + parsed.text + '</div>';
    }
    div.innerHTML = header + body;
    div.appendChild(makeReplyBtn(parsed));
    return div;
  }

  function triggerSubtitleAnimation(el) {
    if (!el) return;
    el.classList.remove('animate-in');
    void el.offsetWidth;
    el.classList.add('animate-in');
  }

  var _lastCurrentText = '';
  var _sessionMsgStartIndex = 0;

  function clearTranscriptDisplay() {
    _lastCurrentText = '';
    if (hcTranscriptCurrent) hcTranscriptCurrent.textContent = '';
    if (hcTranscriptPrev) hcTranscriptPrev.textContent = '';
    if (hcTranscriptNext) hcTranscriptNext.textContent = '';
    if (hcSoloTranscriptCurrent) hcSoloTranscriptCurrent.textContent = '';
    if (hcSoloTranscriptPrev) hcSoloTranscriptPrev.textContent = '';
    if (hcSoloTranscriptNext) hcSoloTranscriptNext.textContent = '';
    if (hcSoloTranscript) hcSoloTranscript.classList.remove('show');
    var hiddenMsgList = document.getElementById('msgList');
    if (hiddenMsgList) {
      _sessionMsgStartIndex = hiddenMsgList.querySelectorAll('.msg').length;
    }
  }

  window._hcClearTranscriptSession = clearTranscriptDisplay;

  function syncTranscripts() {
    try {
      var hiddenMsgList = document.getElementById('msgList');
      if (!hiddenMsgList) return;

      var allItems = hiddenMsgList.querySelectorAll('.msg');
      var items = Array.prototype.slice.call(allItems, _sessionMsgStartIndex);

      if (!items || items.length === 0) {
        if (hcSoloTranscript) hcSoloTranscript.classList.remove('show');
        return;
      }

      var allParsed = [];
      for (var k = 0; k < items.length; k++) {
        allParsed.push(parseMsgElement(items[k]));
      }

      var userMessages = allParsed.filter(function (p) { return !isSystemMessage(p); });

      var lastUserMsg = userMessages.length > 0 ? userMessages[userMessages.length - 1] : (allParsed.length > 0 ? allParsed[allParsed.length - 1] : null);
      if (lastUserMsg && lastUserMsg.text && lastUserMsg.text.trim()) {
        var newText = lastUserMsg.text;
        var textChanged = newText !== _lastCurrentText;
        _lastCurrentText = newText;

        if (hcTranscriptCurrent) {
          hcTranscriptCurrent.textContent = newText;
          if (textChanged) triggerSubtitleAnimation(hcTranscriptCurrent);
        }
        if (hcSoloTranscriptCurrent) {
          hcSoloTranscriptCurrent.textContent = newText;
          if (textChanged) triggerSubtitleAnimation(hcSoloTranscriptCurrent);
        }

        var isStreamPopupOpen = hcStreamPopup && hcStreamPopup.classList.contains('show');
        var isMsgPopupOpen = hcMsgPopup && hcMsgPopup.classList.contains('show');

        if (!isStreamPopupOpen && !isMsgPopupOpen && window._hcVoiceActive) {
          if (hcSoloTranscript) hcSoloTranscript.classList.add('show');
        } else {
          if (hcSoloTranscript) hcSoloTranscript.classList.remove('show');
        }
      } else {
        _lastCurrentText = '';
        if (hcSoloTranscript) hcSoloTranscript.classList.remove('show');
      }

      if (userMessages.length >= 2) {
        var prevUserMsg = userMessages[userMessages.length - 2];
        if (hcTranscriptPrev) hcTranscriptPrev.textContent = prevUserMsg.text || '';
        if (hcSoloTranscriptPrev) hcSoloTranscriptPrev.textContent = prevUserMsg.text || '';
      } else {
        if (hcTranscriptPrev) hcTranscriptPrev.textContent = '';
        if (hcSoloTranscriptPrev) hcSoloTranscriptPrev.textContent = '';
      }

      if (userMessages.length >= 3) {
        var nextUserMsg = userMessages[userMessages.length - 3];
        if (hcTranscriptNext) hcTranscriptNext.textContent = nextUserMsg.text || '';
        if (hcSoloTranscriptNext) hcSoloTranscriptNext.textContent = nextUserMsg.text || '';
      } else {
        if (hcTranscriptNext) hcTranscriptNext.textContent = '';
        if (hcSoloTranscriptNext) hcSoloTranscriptNext.textContent = '';
      }

      if (hcRecentMsgContent) {
        hcRecentMsgContent.innerHTML = '';
        if (userMessages.length === 0) {
          var empty = document.createElement('div');
          empty.className = 'hc-msg-empty';
          empty.textContent = 'No messages yet';
          hcRecentMsgContent.appendChild(empty);
        } else {
          var recentCount = Math.min(userMessages.length, 5);
          for (var i = userMessages.length - 1; i >= userMessages.length - recentCount && i >= 0; i--) {
            hcRecentMsgContent.appendChild(makeMsgItem(userMessages[i]));
          }
        }
      }

      if (hcMsgHistoryContent) {
        hcMsgHistoryContent.innerHTML = '';
        if (userMessages.length === 0) {
          var emptyHist = document.createElement('div');
          emptyHist.className = 'hc-msg-empty';
          emptyHist.textContent = 'No message history';
          hcMsgHistoryContent.appendChild(emptyHist);
        } else {
          for (var j = 0; j < userMessages.length; j++) {
            hcMsgHistoryContent.appendChild(makeMsgItem(userMessages[j]));
          }
          hcMsgHistoryContent.scrollTop = hcMsgHistoryContent.scrollHeight;
        }
      }
    } catch (e) {
      console.warn('[HC-UI] syncTranscripts error:', e);
    }
  }

  setInterval(syncTranscripts, 300);

  (function wireLeftSwipe() {
    var SWIPE_MIN_X = 60;
    var SWIPE_MAX_Y = 80;

    var touchStartX = 0;
    var touchStartY = 0;
    var touchStartTime = 0;

    function onTouchStart(e) {
      var t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touchStartTime = Date.now();
    }

    function onTouchEnd(e) {
      var t = e.changedTouches[0];
      var dx = t.clientX - touchStartX;
      var dy = t.clientY - touchStartY;
      var dt = Date.now() - touchStartTime;

      if (dt > 600) return;
      if (Math.abs(dy) > SWIPE_MAX_Y) return;
      if (dx >= -SWIPE_MIN_X) return;

      triggerLeftSwipeFlow();
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });

    function triggerLeftSwipeFlow() {
      var panelRoot = document.getElementById('rheaCockpitRoot');
      var ehrSidebar = document.getElementById('ehrSidebar');
      var ehrOverlay = document.getElementById('ehrOverlay');
      var ehrButton = document.getElementById('ehrButton');

      if (panelRoot) {
        panelRoot.classList.add('active');
        var toggle = document.getElementById('rheaPanelToggle');
        if (toggle) {
          toggle.classList.add('is-open');
          toggle.setAttribute('aria-expanded', 'true');
          toggle.setAttribute('title', 'Close AI panel');
        }
      }

      if (ehrSidebar) {
        ehrSidebar.classList.add('active');
        ehrSidebar.setAttribute('aria-hidden', 'false');
      }
      if (ehrOverlay) {
        ehrOverlay.classList.add('active');
        ehrOverlay.setAttribute('aria-hidden', 'false');
      }
      if (ehrButton) {
        ehrButton.setAttribute('aria-expanded', 'true');
      }

      if (window.RheaCockpit && typeof window.RheaCockpit.generateAiDiagnosisForActiveTranscript === 'function') {
        window.RheaCockpit.generateAiDiagnosisForActiveTranscript();
      }
    }
  })();
})();
