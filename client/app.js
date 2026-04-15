const socket = io();

let currentGameCode = null;
let isGameMaster = false;
let mySocketId = null;
let myUsername = "";

socket.on('connect', () => {
  mySocketId = socket.id;
});

// Get username with validation
function getUsername() {
  const usernameInput = document.getElementById('username').value.trim();
  if (!usernameInput) {
    alert("Please enter your name before playing!");
    return null;
  }
  return usernameInput;
}

function createGame() {
  const username = getUsername();
  if (!username) return;
  
  myUsername = username;
  socket.emit('createGame', { username });
}

function joinGame() {
  const username = getUsername();
  if (!username) return;
  
  const code = document.getElementById('joinCode').value.trim();
  if (code.length === 6) {
    myUsername = username;
    socket.emit('joinGame', { gameCode: code, username });
  } else {
    alert("Please enter a valid 6-digit code");
  }
}

socket.on('gameCreated', (data) => {
  currentGameCode = data.gameCode;
  isGameMaster = true;
  showGameScreen();
});

socket.on('gameJoined', (data) => {
  currentGameCode = data.gameCode;
  isGameMaster = false;
  showGameScreen();
});

socket.on('playerUpdate', (players) => {
  const container = document.getElementById('players-list');
  container.innerHTML = players.map(p => `
    <div class="flex items-center justify-between bg-zinc-900 px-5 py-4 rounded-2xl">
      <div class="flex items-center gap-3">
        <span class="text-2xl">${p.isMaster ? '👑' : '👤'}</span>
        <span>${p.username}</span>
      </div>
      <span class="text-pink-400">${p.id === mySocketId ? '(You)' : ''}</span>
    </div>
  `).join('');

  const amIMaster = players.some(p => p.id === mySocketId && p.isMaster === true);
  isGameMaster = amIMaster;

  const startBtn = document.getElementById('start-btn');
  if (isGameMaster) {
    startBtn.classList.remove('hidden');
    startBtn.textContent = "▶️ START GAME ROUND";
  } else {
    startBtn.classList.add('hidden');
  }
});

function showGameScreen() {
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('game-status').innerHTML = `Code: <span class="text-pink-400">${currentGameCode}</span>`;
  
  const startBtn = document.getElementById('start-btn');
  if (isGameMaster) {
    startBtn.classList.remove('hidden');
  } else {
    startBtn.classList.add('hidden');
  }
}

function startGame() {
  if (isGameMaster) document.getElementById('question-modal').classList.remove('hidden');
}

function cancelModal() { 
  document.getElementById('question-modal').classList.add('hidden'); 
}

function submitQuestion() {
  const question = document.getElementById('modal-question').value.trim();
  const answer = document.getElementById('modal-answer').value.trim();

  if (question && answer) {
    socket.emit('startRound', { gameCode: currentGameCode, question, answer });
    document.getElementById('question-modal').classList.add('hidden');
  } else {
    alert("Both fields are required!");
  }
};

// ==================== STRONG MOBILE-FRIENDLY ROUND STARTED ====================
socket.on('roundStarted', (data) => {
  console.log("📱 Round started - Question received:", data.question);

  const mainContent = document.getElementById('main-content');
  const guessArea = document.getElementById('guess-area');
  const chatArea = document.getElementById('chat-area');

  if (!mainContent) return;

  // Clear and set new content
  mainContent.innerHTML = `
    <div class="text-center max-w-md mx-auto px-4 py-8">
      <p class="text-pink-400 uppercase tracking-widest text-sm mb-4">GUESS THE SECRET</p>
      <p class="text-xl sm:text-2xl font-medium leading-relaxed break-words">${data.question}</p>
    </div>`;

  if (guessArea) guessArea.classList.remove('hidden');
  if (chatArea) chatArea.innerHTML = '';

  // Multiple forces for stubborn mobile browsers
  setTimeout(() => {
    mainContent.offsetHeight;           // Force reflow
    mainContent.style.opacity = '0.99';
    
    setTimeout(() => {
      mainContent.style.opacity = '1';
    }, 30);
  }, 100);
});

// Timer
socket.on('timerUpdate', (time) => {
  document.getElementById('timer').textContent = time;
});

// Guesses
socket.on('guessMade', (data) => {
  const chat = document.getElementById('chat-area');
  chat.innerHTML += `
    <div class="bg-zinc-800 p-3 rounded-2xl">
      <strong>${data.player}:</strong> ${data.guess} 
      <span class="text-xs text-zinc-400">(${data.attemptsLeft} left)</span>
    </div>`;
  chat.scrollTop = chat.scrollHeight;
});

// Winner
socket.on('gameWon', (data) => {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="text-center py-12">
      <h2 class="text-6xl font-black text-yellow-400 mb-6 animate-bounce">🎉 WINNER! 🎉</h2>
      <p class="text-4xl font-bold mb-4">${data.winner}</p>
      <p class="text-3xl text-green-400 font-semibold">+10 Points</p>
      <p class="text-xl text-pink-400 mt-8">Answer: <span class="font-bold">${data.answer}</span></p>
    </div>`;
  triggerConfetti();
  document.getElementById('guess-area').classList.add('hidden');
});

function triggerConfetti() {
  for (let i = 0; i < 120; i++) {
    setTimeout(() => {
      const c = document.createElement('div');
      c.textContent = ['🎉','✨','👑','💎','🔥'][Math.floor(Math.random()*5)];
      c.style.position = 'fixed';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.top = '-50px';
      c.style.fontSize = '2rem';
      c.style.zIndex = '10000';
      document.body.appendChild(c);
      
      setTimeout(() => {
        c.style.top = '100vh';
        c.style.transform = `rotate(${Math.random()*800}deg)`;
      }, 100);
      setTimeout(() => c.remove(), 5000);
    }, i * 20);
  }
}

// Time Up
socket.on('timeUp', ({ answer }) => {
  document.getElementById('guess-area').classList.add('hidden');
  document.getElementById('main-content').innerHTML += `
    <div class="text-center mt-8">
      <p class="text-2xl text-yellow-400">⏰ Time's Up!</p>
      <p class="text-xl mt-4">Correct Answer: <span class="text-pink-400">${answer}</span></p>
    </div>`;
});

function submitGuess() {
  const input = document.getElementById('guess-input');
  if (input.value.trim()) {
    socket.emit('makeGuess', { gameCode: currentGameCode, guess: input.value });
    input.value = '';
  }
}

// Enter to Guess
document.addEventListener('DOMContentLoaded', () => {
  const guessInput = document.getElementById('guess-input');
  if (guessInput) {
    guessInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        submitGuess();
      }
    });
  }
});