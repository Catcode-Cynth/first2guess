const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.static(path.join(__dirname, '../client')));

let games = {};

// ✅ NORMALIZE FUNCTION 
function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('createGame', () => {
    const gameCode = Math.floor(100000 + Math.random() * 900000).toString();

    games[gameCode] = {
      gameCode,
      players: [],
      gameMaster: socket.id,
      scores: {},
      currentQuestion: null,
      currentAnswer: null,
      isActive: false,
      timer: null,
      attempts: {}
    };

    socket.join(gameCode);

    games[gameCode].players.push({
      id: socket.id,
      username: `Player ${games[gameCode].players.length + 1}`,
      isMaster: true
    });

    socket.emit('gameCreated', { gameCode });
    io.to(gameCode).emit('playerUpdate', games[gameCode].players);
  });

  socket.on('joinGame', (gameCode) => {
    const game = games[gameCode];

    if (!game) {
      socket.emit('error', 'Invalid game code');
      return;
    }

    // TO PREVENT JOINING DURING ACTIVE GAME
    if (game.isActive) {
      socket.emit('error', 'Game already in progress');
      return;
    }

    socket.join(gameCode);

    game.players.push({
      id: socket.id,
      username: `Player ${game.players.length + 1}`,
      isMaster: false
    });

    socket.emit('gameJoined', { gameCode });
    io.to(gameCode).emit('playerUpdate', game.players);
  });

  socket.on('startRound', ({ gameCode, question, answer }) => {
    const game = games[gameCode];
    if (!game || game.gameMaster !== socket.id) return;

    game.currentQuestion = question;

    // ✅ STORE RAW ANSWER (we normalize later)
    game.currentAnswer = answer;

    game.isActive = true;
    game.attempts = {};

    console.log(`Round started for game ${gameCode}`);
    console.log("ANSWER:", game.currentAnswer);

    io.to(gameCode).emit('roundStarted', { question: game.currentQuestion });

    let timeLeft = 60;
    if (game.timer) clearInterval(game.timer);

    game.timer = setInterval(() => {
      timeLeft--;
      io.to(gameCode).emit('timerUpdate', timeLeft);

      if (timeLeft <= 0) {
        clearInterval(game.timer);

        io.to(gameCode).emit('timeUp', {
          answer: game.currentAnswer
        });

        game.isActive = false;

        rotateGameMaster(gameCode);
        resetGame(gameCode);
      }
    }, 1000);
  });

  socket.on('makeGuess', ({ gameCode, guess }) => {
    const game = games[gameCode];
    if (!game || !game.isActive) return;

    const player = game.players.find(p => p.id === socket.id);

    if (!game.attempts[socket.id]) game.attempts[socket.id] = 0;
    if (game.attempts[socket.id] >= 3) return;

    game.attempts[socket.id]++;

    io.to(gameCode).emit('guessMade', {
      player: player.username,
      guess,
      attemptsLeft: 3 - game.attempts[socket.id]
    });

    // ✅ NORMALIZED COMPARISON (MAIN FIX)
    const normalizedGuess = normalize(guess);
    const normalizedAnswer = normalize(game.currentAnswer);

    console.log("GUESS:", normalizedGuess);
    console.log("ANSWER:", normalizedAnswer);

    if (normalizedGuess === normalizedAnswer) {
      if (!game.scores[socket.id]) game.scores[socket.id] = 0;
      game.scores[socket.id] += 10;

      clearInterval(game.timer);

      io.to(gameCode).emit('gameWon', {
        winner: player.username,
        answer: game.currentAnswer,
        scores: game.scores // ✅ send scores
      });

      game.isActive = false;

      rotateGameMaster(gameCode);
      resetGame(gameCode);
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
  });
});

// ✅ ROTATE GAME MASTER
function rotateGameMaster(gameCode) {
  const game = games[gameCode];
  if (!game) return;

  const currentIndex = game.players.findIndex(p => p.id === game.gameMaster);
  const nextIndex = (currentIndex + 1) % game.players.length;

  game.players.forEach(p => p.isMaster = false);

  game.players[nextIndex].isMaster = true;
  game.gameMaster = game.players[nextIndex].id;

  io.to(gameCode).emit('playerUpdate', game.players);
}

// ✅ RESET GAME AFTER ROUND
function resetGame(gameCode) {
  const game = games[gameCode];
  if (!game) return;

  game.currentQuestion = null;
  game.currentAnswer = null;
  game.attempts = {};
}
 
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 First2Guess Server running on port ${PORT}`));