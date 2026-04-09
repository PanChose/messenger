const socket = io('https://messenger-hxxk.onrender.com');

// --- UI Elements ---
const authContainer = document.getElementById('auth-container');
const chatContainer = document.getElementById('chat-container');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubmit = document.getElementById('auth-submit');
const authToggle = document.getElementById('auth-toggle');
const authMessage = document.getElementById('auth-message');

const usernameInput = document.getElementById('username-input');
const passwordInput = document.getElementById('password-input');

const msgInput = document.querySelector('#message');
const nameInput = document.querySelector('#name');
const chatRoom = document.querySelector('#room');
const activity = document.querySelector('.activity');
const chatDisplay = document.querySelector('.chat-display');
const usersList = document.querySelector('.user-list');
const roomList = document.querySelector('.room-list');

// --- App State ---
let isLoginMode = true;
let currentRoom = "";

// --- 1. ПРОВЕРКА ЛОГИНА ПРИ ЗАГРУЗКЕ ---
window.addEventListener('DOMContentLoaded', () => {
    const savedName = localStorage.getItem('chat_username');
    if (savedName) {
        enterChatApp(savedName);
    }
});

// --- Auth Toggle Logic ---
authToggle.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
        e.preventDefault();
        isLoginMode = !isLoginMode;

        authTitle.innerText = isLoginMode ? 'Login' : 'Register';
        authSubmit.innerText = isLoginMode ? 'Login' : 'Register';

        const link = authToggle.querySelector('a');
        const textNode = authToggle.childNodes[0];

        if (isLoginMode) {
            textNode.textContent = "Don't have an account? ";
            link.textContent = "Register";
        } else {
            textNode.textContent = "Already have an account? ";
            link.textContent = "Login";
        }
        authMessage.innerText = "";
    }
});

// --- Auth API Integration ---
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = usernameInput.value;
    const password = passwordInput.value;
    const endpoint = isLoginMode ? '/auth/login' : '/auth/register';

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            if (!isLoginMode) {
                // После регистрации: очистка и переход на логин
                usernameInput.value = '';
                passwordInput.value = '';
                isLoginMode = true;

                authTitle.innerText = 'Login';
                authSubmit.innerText = 'Login';
                authToggle.childNodes[0].textContent = "Don't have an account? ";
                authToggle.querySelector('a').textContent = "Register";

                authMessage.style.color = '#00ff00';
                authMessage.innerText = "Registration successful! Please login.";
            } else {
                // После логина: сохраняем сессию
                localStorage.setItem('chat_username', username);
                enterChatApp(username);
            }
        } else {
            authMessage.style.color = '#ff4444';
            authMessage.innerText = data.message;
        }
    } catch (err) {
        authMessage.innerText = "Server connection failed.";
    }
});

function enterChatApp(username) {
    authContainer.style.display = 'none';
    chatContainer.style.display = 'flex';
    nameInput.value = username;
    // Запрашиваем список комнат у сервера при входе
    socket.emit('requestRoomList');
}

// LOGOUT
document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('chat_username');
    location.reload();
});

// --- Chat Logic ---

function sendMessage(e) {
    e.preventDefault();
    if (nameInput.value && msgInput.value && currentRoom) {
        socket.emit('message', {
            name: nameInput.value,
            text: msgInput.value
        });
        msgInput.value = "";
    }
    msgInput.focus();
}

function enterRoom(e) {
    if (e) e.preventDefault();
    const newRoom = chatRoom.value.trim();

    if (nameInput.value && newRoom) {
        if (newRoom === currentRoom) {
            alert("You are already in this room!");
            return;
        }

        socket.emit('enterRoom', {
            name: nameInput.value,
            room: newRoom
        });

        currentRoom = newRoom;
        document.querySelector('#current-room-display').textContent = newRoom;
        chatDisplay.innerHTML = "";
    }
}

document.querySelector('.form-msg').addEventListener('submit', sendMessage);
document.querySelector('.form-join').addEventListener('submit', enterRoom);

msgInput.addEventListener('keypress', () => {
    socket.emit('activity', nameInput.value);
});

// --- Socket Listeners ---

socket.on("message", (data) => {
    activity.textContent = "";
    const li = document.createElement('li');
    li.className = 'post';

    if (data.name === nameInput.value) li.className = 'post post--right';
    else if (data.name !== 'Admin') li.className = 'post post--left';

    li.innerHTML = data.name !== 'Admin'
        ? `<div class="post__header"><span class="post__header--name">${data.name}</span><span class="post__header--time">${data.time}</span></div><div class="post__text">${data.text}</div>`
        : `<div class="post__text">${data.text}</div>`;

    chatDisplay.appendChild(li);
    chatDisplay.scrollTop = chatDisplay.scrollHeight;
});

socket.on('userList', ({ users }) => {
    showUsers(users);
});

socket.on('roomList', ({ rooms }) => {
    showRooms(rooms);
});

function showUsers(users) {
    usersList.innerHTML = '';
    if (users) {
        users.forEach(user => {
            const li = document.createElement('li');
            li.textContent = user.name;
            usersList.appendChild(li);
        });
    }
}

function showRooms(rooms) {
    roomList.innerHTML = '';
    if (rooms) {
        rooms.forEach(room => {
            const li = document.createElement('li');
            li.textContent = room;
            li.style.cursor = 'pointer';
            li.onclick = (e) => {
                e.preventDefault();
                chatRoom.value = room;
                enterRoom(); // Используем функцию напрямую без лишних ивентов
            };
            roomList.appendChild(li);
        });
    }
}

let activityTimer;
socket.on("activity", (name) => {
    activity.textContent = `${name} is typing...`;
    clearTimeout(activityTimer);
    activityTimer = setTimeout(() => {
        activity.textContent = "";
    }, 3000);
});