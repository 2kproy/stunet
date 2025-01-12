// server/index.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const cors = require('cors');
const channelMembers = {}; 
// channelMembers[channelId] = ['user1', 'user2', ...]

const { createUser, verifyUser } = require('./usersDb');
const { generateToken, verifyToken } = require('./auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // Настройки CORS для Socket.IO, если нужно
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// ====== МАРШРУТЫ АВТОРИЗАЦИИ ======

// POST /register { username, password }
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Введите username и password' });

  // Проверяем, не существует ли пользователь
  const userExists = await verifyUser(username, password);
  if (userExists) {
    return res.status(400).json({ error: 'Пользователь уже существует' });
  }
  
  // Создаём нового пользователя
  await createUser(username, password);
  return res.json({ success: true });
});

// POST /login { username, password }
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Введите username и password' });

  // Проверяем пользователя
  const user = await verifyUser(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Неверные логин/пароль' });
  }

  // Генерируем JWT
  const token = generateToken(user);
  return res.json({ token });
});

// ====== SOCKET.IO ======

// Миддлвара Socket.IO для проверки JWT при подключении
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Токен не передан'));
  }
  try {
    const payload = verifyToken(token);
    socket.user = payload; // сохраняем инфу о пользователе в socket
    next();
  } catch (err) {
    return next(new Error('Невалидный токен'));
  }
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id, 'Username:', socket.user.username);

  // -----------------
  // 1) ТЕКСТОВЫЙ ЧАТ
  // -----------------
  socket.on('chat message', (msg) => {
    // Рассылаем всем сообщение
    io.emit('chat message', {
      user: socket.user.username,
      text: msg
    });
  });

  // ---------------------
  // 2) MULTI-USER VOICE
  // ---------------------
  // Упрощённый подход: mesh-сеть (каждый peer с каждым).
  // В реальном Discord это делается иначе, через специальный SFU/Voice-сервер.

  // Событие: пользователь создал "предложение" (offer) для конкретного канала или набора людей
  socket.on('voice-offer', (data) => {
    // data = { offer, channelId }
    // Рассылаем "offer" всем участникам канала, кроме самого отправителя
	console.log(`Server got voice-offer from socket.id=${socket.id}`, data);
    socket.to(data.channelId).emit('voice-offer', {
      fromUser: socket.user.username,
      offer: data.offer
    });
  });

  // Событие: ответ (answer)
  socket.on('voice-answer', (data) => {
    // data = { answer, channelId }
	console.log(`Server got voice-answer from socket.id=${socket.id}`, data);
    socket.to(data.channelId).emit('voice-answer', {
      fromUser: socket.user.username,
      answer: data.answer
    });
  });

  // Событие: ICE-кандидат
  socket.on('voice-candidate', (data) => {
    // data = { candidate, channelId }
	console.log(`Server got voice-candidate from socket.id=${socket.id}`, data);
    socket.to(data.channelId).emit('voice-candidate', {
      fromUser: socket.user.username,
      candidate: data.candidate
    });
  });

  // Событие: пользователь входит в голосовой "канал"
  socket.on('join-voice-channel', (channelId) => {
    socket.join(channelId);

    // Инициализируем массив, если не существует
    if (!channelMembers[channelId]) {
      channelMembers[channelId] = [];
    }
    // Добавляем, если нет (на всякий случай проверим)
    const username = socket.user.username;
    if (!channelMembers[channelId].includes(username)) {
      channelMembers[channelId].push(username);
    }
    io.to(channelId).emit('channel-members', channelMembers[channelId]);

    console.log(`${socket.user.username} joined voice channel ${channelId}`);
  });

  // Событие: пользователь покидает голосовой "канал"
  socket.on('leave-voice-channel', (channelId) => {
    socket.leave(channelId);

    const username = socket.user.username;
    if (channelMembers[channelId]) {
      // Удалим юзера
      channelMembers[channelId] = channelMembers[channelId].filter(u => u !== username);

      console.log(`${username} left voice channel ${channelId}`);
      // Рассылаем всем
      io.to(channelId).emit('channel-members', channelMembers[channelId]);
    }
  });

  // Когда пользователь отключается
  socket.on('disconnect', () => {
    for (const [channelId, members] of Object.entries(channelMembers)) {
      const index = members.indexOf(socket.user.username);
      if (index !== -1) {
        members.splice(index, 1); // удаляем
        // Рассылаем обновлённый список
        io.to(channelId).emit('channel-members', channelMembers[channelId]);
      }
    }
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
