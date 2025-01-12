// server/auth.js

const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'SUPER_SECRET_KEY'; 
// В реальном продакшене храните секрет в .env и не выкладывайте его в Git

function generateToken(user) {
  // user = { username: '...', passwordHash: '...' }
  // В payload можно хранить userId, роли и т. п.
  return jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '1h' });
}

// Проверка валидности токена
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  generateToken,
  verifyToken
};
