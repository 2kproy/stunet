// server/usersDb.js

const bcrypt = require('bcrypt');

// Пример: массив пользователей (вместо настоящей БД).
// В реальном мире пароли НЕ хранятся в виде открытого текста – только хэши.
const users = [
  // {
  //   username: 'admin',
  //   passwordHash: '...'  // bcrypt-хэш
  // }
];

async function createUser(username, password) {
  const passwordHash = await bcrypt.hash(password, 10);
  users.push({ username, passwordHash });
}

async function findUserByUsername(username) {
  return users.find((u) => u.username === username);
}

async function verifyUser(username, password) {
  const user = await findUserByUsername(username);
  if (!user) return false;
  const match = await bcrypt.compare(password, user.passwordHash);
  return match ? user : false;
}

module.exports = {
  createUser,
  findUserByUsername,
  verifyUser,
  users // Для отладки, не делайте так в реальном коде :)
};
