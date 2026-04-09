const socket = io('https://messenger-hxxk.onrender.com');

// Auth Elements
const authContainer = document.getElementById('auth-container');
const chatContainer = document.getElementById('chat-container');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubmit = document.getElementById('auth-submit');
const authToggle = document.getElementById('auth-toggle');
const authMessage = document.getElementById('auth-message');

// Chat Elements
const msgInput = document.querySelector('#message');
const nameInput = document.querySelector('#name');
const chatRoom = document.querySelector('#room');
const activity = document.querySelector('.activity');
const chatDisplay = document.querySelector('.chat-display');

let isLoginMode = true;

// --- Auth UI Toggle ---
authToggle.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    authTitle.innerText = isLoginMode ? 'Login' : 'Register';
    authSubmit.innerText = isLoginMode ? 'Login' : 'Register';
    authToggle.innerHTML = isLoginMode
        ? "Don't have an account? <a href='#'>Register</a>"
        : "Already have an account? <a href='#'>Login</a>";
});

// --- Handle Login/Register ---
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username-input').value;
    const password = document.getElementById('password-input').value;
    const path = isLoginMode ? '/auth/login' : '/auth/register';

    try {
        const response = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            if (!isLoginMode) {
                // If registered, switch to login
                isLoginMode = true;
                authToggle.click();
                authMessage.style.color = 'green';
                authMessage.innerText = "Registration successful! Please login.";
            } else {
                // If logged in, show chat
                startApp(username);
            }
        } else {
            authMessage.style.color = 'red';
            authMessage.innerText = data.message;
        }
    } catch (err) {
        authMessage.innerText = "Error connecting to server.";
    }
});

function startApp(username) {
    authContainer.style.display = 'none';
    chatContainer.style.display = 'flex';
    nameInput.value = username; // Fill the hidden name field
}

document.getElementById('logout-btn').addEventListener('click', () => {
    location.reload();
});

// --- Existing Socket Logic ---
function sendMessage(e) {
    e.preventDefault();
    if (nameInput.value && msgInput.value && chatRoom.value) {
        socket.emit('message', { name: nameInput.value, text: msgInput.value });
        msgInput.value = "";
    }
    msgInput.focus();
}

function enterRoom(e) {
    e.preventDefault();
    if (nameInput.value && chatRoom.value) {
        socket.emit('enterRoom', { name: nameInput.value, room: chatRoom.value });
        document.querySelector('#current-room-display').textContent = chatRoom.value;
    }
}

document.querySelector('.form-msg').addEventListener('submit', sendMessage);
document.querySelector('.form-join').addEventListener('submit', enterRoom);

msgInput.addEventListener('keypress', () => {
    socket.emit('activity', nameInput.value);
});

socket.on("message", (data) => {
    activity.textContent = "";
    const li = document.createElement('li');
    li.className = 'post';
    if (data.name === nameInput.value) li.className = 'post post--right';
    if (data.name !== nameInput.value && data.name !== 'Admin') li.className = 'post post--left';
    if (data.name !== 'Admin') {
        li.innerHTML = `<div class="post__header">
            <span class="post__header--name">${data.name}</span>
            <span class="post__header--time">${data.time}</span>
        </div>
        <div class="post__text">${data.text}</div>`;
    } else {
        li.innerHTML = `<div class="post__text">${data.text}</div>`;
    }
    chatDisplay.appendChild(li);
    chatDisplay.scrollTop = chatDisplay.scrollHeight;
});

let activityTimer;
socket.on("activity", (name) => {
    activity.textContent = `${name} is typing...`;
    clearTimeout(activityTimer);
    activityTimer = setTimeout(() => { activity.textContent = "" }, 3000);
});