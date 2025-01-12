// public/main.js
let token = null;
let socket = null;

// Параметры настроек микро(по умолчанию)
let noiseSuppressionEnabled = true;
let echoCancellationEnabled = true;
let autoGainEnabled = true;
let micVolume = 1.0;  // 1.0 = 100%

let localStream = null;
let audioContext = null;
let sourceNode = null;
let gainNode = null;

// Элементы
const regUsername = document.getElementById('regUsername');
const regPassword = document.getElementById('regPassword');
const registerBtn = document.getElementById('registerBtn');

const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginBtn = document.getElementById('loginBtn');
const loginStatus = document.getElementById('loginStatus');

const chatArea = document.getElementById('chatArea');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesList = document.getElementById('messages');

const voiceArea = document.getElementById('voiceArea');
const channelIdInput = document.getElementById('channelId');
const joinStatus = document.getElementById('joinStatus');
const joinChannelBtn = document.getElementById('joinChannelBtn');
const leaveChannelBtn = document.getElementById('leaveChannelBtn');

const localAudio = document.getElementById('localAudio');
const remoteAudios = document.getElementById('remoteAudios');

// Элементы микро
const micSettingsBtn = document.getElementById('micSettingsBtn');
const micSettingsModal = document.getElementById('micSettingsModal');

const noiseSuppressionChk = document.getElementById('noiseSuppressionChk');
const echoCancellationChk = document.getElementById('echoCancellationChk');
const autoGainChk = document.getElementById('autoGainChk');

const micVolumeRange = document.getElementById('micVolumeRange');
const micVolumeVal = document.getElementById('micVolumeVal');

const applyMicSettingsBtn = document.getElementById('applyMicSettingsBtn');
const closeMicSettingsBtn = document.getElementById('closeMicSettingsBtn');

// ======================
// 1) Регистрация
// ======================
registerBtn.addEventListener('click', async () => {
  const username = regUsername.value.trim();
  const password = regPassword.value.trim();
  if (!username || !password) {
    alert('Заполните поля!');
    return;
  }

  try {
    const res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.error) {
      alert(`Ошибка: ${data.error}`);
    } else {
      alert('Записал тебя карандашиком, можешь попытаться войти');
    }
  } catch (err) {
    console.error(err);
    alert('Ошибка запроса');
  }
});

// ======================
// 2) Логин
// ======================
loginBtn.addEventListener('click', async () => {
  const username = loginUsername.value.trim();
  const password = loginPassword.value.trim();
  if (!username || !password) {
    alert('Заполните поля!');
    return;
  }

  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.error) {
      loginStatus.textContent = `Ошибка: ${data.error}`;
    } else if (data.token) {
      token = data.token;
      loginStatus.textContent = 'Успешный вход!';

      // Подключаемся к Socket.IO с токеном
      connectSocketIO(token);
      hideAuthForms();
    }
  } catch (err) {
    console.error(err);
    alert('Ошибка запроса');
  }
});

function connectSocketIO(token) {
  socket = io({
    auth: {
      token
    }
  });

  // Когда мы успешно подключились к серверу
  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    chatArea.style.display = 'block';
    voiceArea.style.display = 'block';
    joinStatus.textContent = 'Напиши канал к которому хочешь подключиться';
  });

  // Текстовый чат
  sendBtn.addEventListener('click', () => {
    const msg = messageInput.value.trim();
    if (!msg) return;
    socket.emit('chat message', msg);
    messageInput.value = '';
  });

  socket.on('chat message', (data) => {
    const li = document.createElement('li');
    li.textContent = `${data.user}: ${data.text}`;
    messagesList.appendChild(li);
  });

  // ---------------------
  // МУЛЬТИПОЛЬЗОВАТЕЛЬСКИЙ ГОЛОСОВОЙ КАНАЛ (MESH)
  // ---------------------
  
initLocalStream();

  joinChannelBtn.addEventListener('click', () => {
    const channelId = channelIdInput.value.trim();
    if (!channelId) return;
    socket.emit('join-voice-channel', channelId);
    currentChannelId = channelId;

  // Через секунду (или сразу) попробуем вручную вызвать createOffer
	  setTimeout(async () => {
		if (!peerConnections['myTemporaryId']) {
		  peerConnections['myTemporaryId'] = createPeerConnection('myTemporaryId');
		}
		const pc = peerConnections['myTemporaryId'];
		if (pc) {
		  console.log('Manually triggering createOffer()');
		  const offer = await pc.createOffer();
		  await pc.setLocalDescription(offer);
		  socket.emit('voice-offer', {
			offer,
			channelId: currentChannelId
		  });
		}
	  }, 1000);
    hideJoin();
    joinStatus.textContent = `Вы подключены к каналу ${channelId}`; //поправить
    // Как только мы в канале, WebRTC по mesh-принципу будет создавать офферы
    // при onnegotiationneeded, чтобы связаться с остальными.
  });

  leaveChannelBtn.addEventListener('click', () => {
    if (currentChannelId) {
      socket.emit('leave-voice-channel', currentChannelId);
      currentChannelId = null;
      cleanupPeerConnections();
      showJoin();
      joinStatus.textContent = 'Вы не подключены к голосовому каналу';
    }
  });

  socket.on('voice-offer', async (data) => {
    const fromUser = data.fromUser;
    console.log(`Got voice-offer from ${fromUser}`);
    handleOffer(data.offer, fromUser);
  });

  socket.on('voice-answer', async (data) => {
    const fromUser = data.fromUser;
    console.log(`Got voice-answer from ${fromUser}`);
    await handleAnswer(data.answer, fromUser);
  });

  socket.on('voice-candidate', async (data) => {
    const fromUser = data.fromUser;
    console.log(`Got candidate from ${fromUser}`);
    await handleCandidate(data.candidate, fromUser);
  });
}

//====================Настройка микро============================================================================
// === 1) Открываем/закрываем окно настроек ===
micSettingsBtn.addEventListener('click', () => {
  micSettingsModal.style.display = 'block';
});

closeMicSettingsBtn.addEventListener('click', () => {
  micSettingsModal.style.display = 'none';
});

// === 2) Реакция на ползунок громкости (отображаем значение) ===
micVolumeRange.addEventListener('input', () => {
  micVolumeVal.textContent = micVolumeRange.value;
  applyMicSett();
});

// === 3) При "Применить" сохраняем выбранные значения и перезапрашиваем поток ===
applyMicSettingsBtn.addEventListener('click', async () => {
  // Сохраняем настройки из чекбоксов
  noiseSuppressionEnabled = noiseSuppressionChk.checked;
  echoCancellationEnabled = echoCancellationChk.checked;
  autoGainEnabled = autoGainChk.checked;

  // Громкость (0..100 => 0..1)
  const vol = parseInt(micVolumeRange.value, 10);
  micVolume = vol / 100.0;

  // Закрываем окно
  micSettingsModal.style.display = 'none';
  
  // Перезапускаем микрофон с новыми параметрами
  await initLocalStream();
});

async function applyMicSett() {
  // Сохраняем настройки из чекбоксов
  noiseSuppressionEnabled = noiseSuppressionChk.checked;
  echoCancellationEnabled = echoCancellationChk.checked;
  autoGainEnabled = autoGainChk.checked;

  // Громкость (0..100 => 0..1)
  const vol = parseInt(micVolumeRange.value, 10);
  micVolume = vol / 100.0;
  
  // Перезапускаем микрофон с новыми параметрами
  await initLocalStream();
}


// === 4) Функция initLocalStream с учётом новых настроек ===
async function initLocalStream() {
  // Если был старый stream, останавливаем треки (чтобы освободить микрофон)
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
  }
  // Если был старый audioContext, закрываем
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  try {
    // 4.1) Запрашиваем новый MediaStream
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        noiseSuppression: noiseSuppressionEnabled,
        echoCancellation: echoCancellationEnabled,
        autoGainControl: autoGainEnabled
      }
    });
    console.log('Got localStream with constraints:', {
      noiseSuppression: noiseSuppressionEnabled,
      echoCancellation: echoCancellationEnabled,
      autoGainControl: autoGainEnabled
    });

    // 4.2) Создаём AudioContext и GainNode для управления громкостью
    audioContext = new AudioContext();
    gainNode = audioContext.createGain();
    gainNode.gain.value = micVolume; // Применяем уровень громкости

    // 4.3) Создаём sourceNode из localStream
    sourceNode = audioContext.createMediaStreamSource(localStream);

    // 4.4) Соединяем: source -> gainNode -> destination
    sourceNode.connect(gainNode).connect(audioContext.destination);

    // 4.5) Также, чтобы слушать поток в <audio> напрямую, можно
    // (A) назначить localAudio.srcObject = localStream;
    // ИЛИ (B) использовать "прокачанный" через AudioContext поток:
    //    let dest = audioContext.createMediaStreamDestination();
    //    gainNode.connect(dest);
    //    localAudio.srcObject = dest.stream;

    // Для простоты, назначим напрямую исходный поток:
    //localAudio.srcObject = localStream;
    localAudio.muted = true

  } catch (err) {
    console.error('Ошибка доступа к микрофону:', err);
  }
}
//===================================================================================================================

// Локальный аудиопоток

// async function initLocalStream() {
//   try {
//     localStream = await navigator.mediaDevices.getUserMedia({ 
//       audio: {
//         noiseSuppression: true, //шумка
//         echoCancellation: true, //эхо
//         autoGainControl: true //автогейн
//       }
//     });
//     localAudio.srcObject = localStream;
//   } catch (err) {
//     console.error('Ошибка доступа к микрофону:', err);
//   }
// }

// Текущее подключение
let currentChannelId = null;
let peerConnections = {};  // { username: RTCPeerConnection }
let remoteAudioElements = {}; // { username: HTMLAudioElement }

// Создаём PeerConnection при необходимости
function createPeerConnection(username) {
  const pc = new RTCPeerConnection({ 
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }
      // Для продакшена добавьте TURN-сервер
    ]
  });

  // === Добавлено для логов ICE ===
  pc.addEventListener('iceconnectionstatechange', () => {
    console.log(`ICE state [${username}]:`, pc.iceConnectionState);
  });

  pc.addEventListener('connectionstatechange', () => {
    console.log(`RTCPeerConnection state [${username}]:`, pc.connectionState);
  });
  // === Конец добавленных логов ===

  // Добавляем локальные треки
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });
  }

  // Когда получаем трек от собеседника
  pc.ontrack = (event) => {
    if (!remoteAudioElements[username]) {
      const audio = document.createElement('audio');
      audio.autoplay = true;
      remoteAudios.appendChild(audio);
      remoteAudioElements[username] = audio;
    }
    remoteAudioElements[username].srcObject = event.streams[0];
  };

  // Когда генерируется ICE-кандидат – отправляем
  pc.onicecandidate = (event) => {
    if (event.candidate && currentChannelId) {
      console.log(`New ICE candidate [${username}]:`, event.candidate);
      socket.emit('voice-candidate', {
        candidate: event.candidate,
        channelId: currentChannelId
      });
    } else if (!event.candidate) {
      console.log(`All ICE candidates have been gathered for [${username}]`);
    }
  };

  // Когда требуется начать пересылку offer заново
  pc.onnegotiationneeded = async () => {
    if (!currentChannelId) return; // Мы не в канале

    try {
      console.log(`onnegotiationneeded -> createOffer() for [${username}]`);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Отправляем серверу
      socket.emit('voice-offer', {
        offer,
        channelId: currentChannelId
      });
    } catch (err) {
      console.error('onnegotiationneeded error:', err);
    }
  };

  return pc;
}

// Обработка входящего offer
async function handleOffer(offer, fromUser) {
  let pc = peerConnections[fromUser];
  if (!pc) {
    pc = createPeerConnection(fromUser);
    peerConnections[fromUser] = pc;
  }

  console.log(`handleOffer -> setRemoteDescription from [${fromUser}]`);
  await pc.setRemoteDescription(offer);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  // Отправляем answer
  socket.emit('voice-answer', {
    answer,
    channelId: currentChannelId
  });
  console.log(`handleOffer -> sent answer to [${fromUser}]`);
}

// Обработка входящего answer
async function handleAnswer(answer, fromUser) {
  const pc = peerConnections[fromUser];
  if (!pc) return;
  console.log(`handleAnswer -> setRemoteDescription from [${fromUser}]`);
  await pc.setRemoteDescription(answer);
}

// Обработка входящего candidate
async function handleCandidate(candidate, fromUser) {
  let pc = peerConnections[fromUser];
  if (!pc) {
    // Создаём на лету
    pc = createPeerConnection(fromUser);
    peerConnections[fromUser] = pc;
  }
  try {
    console.log(`handleCandidate from [${fromUser}] -> addIceCandidate`);
    await pc.addIceCandidate(candidate);
  } catch (err) {
    console.error('Error adding candidate:', err);
  }
}

// «Очистка» соединений, когда выходим из канала
function cleanupPeerConnections() {
  for (const username in peerConnections) {
    console.log(`Closing peerConnection for [${username}]`);
    peerConnections[username].close();
  }
  peerConnections = {};

  for (const username in remoteAudioElements) {
    remoteAudioElements[username].remove();
  }
  remoteAudioElements = {};
}

function showAuthForms() {
  document.getElementById('authForms').style.display = 'block';
  document.getElementById('mainUI').style.display = 'none';
}
function hideAuthForms() {
  document.getElementById('authForms').style.display = 'none';
  document.getElementById('mainUI').style.display = 'block';
}

function showJoin() {
  document.getElementById('joinChannelBtn').style.display = 'block';
  document.getElementById('leaveChannelBtn').style.display = 'none';
}
function hideJoin() {
  document.getElementById('joinChannelBtn').style.display = 'none';
  document.getElementById('leaveChannelBtn').style.display = 'block';
}