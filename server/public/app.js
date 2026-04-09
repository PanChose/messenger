const socket = io('https://messenger-hxxk.onrender.com');

// --- Элементы UI ---
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
const nameInput = document.querySelector('#name'); // Скрытое поле или рид-онли
const activity = document.querySelector('.activity');
const chatDisplay = document.querySelector('.chat-display');
const chatList = document.getElementById('chat-list'); // Список чатов слева
const searchInput = document.getElementById('user-search');
const currentChatDisplay = document.getElementById('current-room-display');

// --- Состояние приложения ---
let isLoginMode = true;
let currentChatPartner = null;
let unreadCounts = {}; // { "username": количество }
let searchResults = [];
let recentChats = JSON.parse(localStorage.getItem('recent_chats') || "[]");

// --- 1. Авторизация (Твоя логика) ---

window.addEventListener('DOMContentLoaded', () => {
    const savedName = localStorage.getItem('chat_username');
    if (savedName) {
        enterChatApp(savedName);
    }
});

authToggle.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    authTitle.innerText = isLoginMode ? 'Login' : 'Register';
    authSubmit.innerText = isLoginMode ? 'Login' : 'Register';
    authToggle.innerHTML = isLoginMode
        ? "Don't have an account? <a href='#'>Register</a>"
        : "Already have an account? <a href='#'>Login</a>";
});

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

        if (response.ok) {
            localStorage.setItem('chat_username', username);
            enterChatApp(username);
        } else {
            authMessage.innerText = data.message;
            authMessage.style.color = 'red';
        }
    } catch (err) {
        authMessage.innerText = "Error connecting to server";
    }
});

function enterChatApp(username) {
    nameInput.value = username;
    authContainer.style.display = 'none';
    chatContainer.style.display = 'flex';

    // Сообщаем серверу, что мы онлайн
    socket.emit('enterRoom', { name: username, room: 'global' });
    renderChatList();
}

document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('chat_username');
    location.reload();
});

// --- 2. Логика поиска и списка чатов (WhatsApp Style) ---

searchInput.addEventListener('input', async (e) => {
    const q = e.target.value;
    const me = nameInput.value;

    if (q.length > 0) {
        try {
            const res = await fetch(`/users/search?q=${q}&me=${me}`);
            searchResults = await res.json();
        } catch (err) {
            console.error("Search error", err);
        }
    } else {
        searchResults = [];
    }
    renderChatList();
});

function renderChatList() {
    chatList.innerHTML = '';

    // Если в поиске что-то есть — показываем результаты. Иначе — список недавних.
    const displayUsers = searchInput.value.length > 0 ? searchResults : recentChats;

    displayUsers.forEach(username => {
        const li = document.createElement('li');
        li.className = 'chat-item';
        if (username === currentChatPartner) li.classList.add('active');

        const unread = unreadCounts[username] || 0;

        li.innerHTML = `
            <div class="chat-info">
                <span class="chat-name">${username}</span>
                ${unread > 0 ? `<span class="badge pulse">${unread}</span>` : ''}
            </div>
        `;

        li.onclick = () => openChat(username);
        chatList.appendChild(li);
    });
}

// Функция для отрисовки одного сообщения (вынеси её отдельно, чтобы не дублировать код)
function renderSingleMessage(data) {
    const li = document.createElement('li');
    const myName = localStorage.getItem('chat_username');

    li.className = 'post';
    if (data.name === myName) li.classList.add('post--right');
    else if (data.name !== 'Admin') li.classList.add('post--left');

    li.innerHTML = `
        <div class="post__header">
            <span class="post__header--name">${data.name}</span>
            <span class="post__header--time">${data.time}</span>
        </div>
        <div class="post__text">${data.text}</div>
    `;
    chatDisplay.appendChild(li);
    chatDisplay.scrollTop = chatDisplay.scrollHeight;
}

// Изменяем логику клика на пользователя
async function openChat(targetName) {
    privateRecipient = targetName;
    const myName = localStorage.getItem('chat_username');

    // 1. Меняем заголовок
    document.querySelector('#current-room-display').textContent = `Chat with: ${targetName}`;
    document.querySelector('#current-room-display').style.color = '#ffaa00';

    // 2. Очищаем экран перед загрузкой
    chatDisplay.innerHTML = '<li style="text-align:center; color:gray;">Loading history...</li>';

    // 3. ЗАГРУЖАЕМ ИСТОРИЮ ИЗ БД
    try {
        const response = await fetch(`/messages/${myName}/${targetName}`);
        const history = await response.json();

        chatDisplay.innerHTML = ""; // Убираем надпись Loading

        if (history.length === 0) {
            chatDisplay.innerHTML = '<li style="text-align:center; color:gray; margin-top:20px;">No messages yet. Say hi!</li>';
        }

        history.forEach(msg => {
            renderSingleMessage({
                name: msg.sender,
                text: msg.text,
                time: msg.time
            });
        });
    } catch (err) {
        console.error("Error loading history:", err);
        chatDisplay.innerHTML = '<li style="text-align:center; color:red;">Failed to load history</li>';
    }
}

// --- 3. Работа с сообщениями ---

function sendMessage(e) {
    e.preventDefault();
    if (msgInput.value && currentChatPartner) {
        socket.emit('privateMessage', {
            sender: nameInput.value,
            recipient: currentChatPartner,
            text: msgInput.value
        });
        msgInput.value = "";
    } else if (!currentChatPartner) {
        alert("Please select a user to chat with");
    }
}

document.querySelector('.form-msg').addEventListener('submit', sendMessage);

socket.on("message", (data) => {
    const myName = nameInput.value;

    // Если это приватное сообщение
    if (data.isPrivate) {
        // Если сообщение мне, но от того, кто сейчас НЕ открыт
        if (data.name !== currentChatPartner && data.name !== myName && data.name !== 'Admin') {
            const sender = data.name;
            unreadCounts[sender] = (unreadCounts[sender] || 0) + 1;

            // Поднимаем отправителя в топ списка чатов
            recentChats = [sender, ...recentChats.filter(u => u !== sender)];
            localStorage.setItem('recent_chats', JSON.stringify(recentChats));

            renderChatList();
            return; // Не печатаем сообщение в текущее окно
        }
    }

    // Печатаем, если: это текущий чат, или это наше сообщение, или это Админ
    if (data.name === currentChatPartner || data.name === myName || data.name === 'Admin') {
        const li = document.createElement('li');
        li.className = 'post';

        if (data.name === myName) li.classList.add('post--right');
        else if (data.name !== 'Admin') li.classList.add('post--left');
        else li.classList.add('post--admin');

        li.innerHTML = `
            <div class="post__header">
                <span class="post__header--name">${data.name}</span>
                <span class="post__header--time">${data.time}</span>
            </div>
            <div class="post__text">${data.text}</div>
        `;
        chatDisplay.appendChild(li);
        chatDisplay.scrollTop = chatDisplay.scrollHeight;
    }
});

// --- Индикация печатания ---
msgInput.addEventListener('keypress', () => {
    if (currentChatPartner) {
        socket.emit('activity', nameInput.value);
    }
});

let activityTimer;
socket.on("activity", (name) => {
    if (name === currentChatPartner) {
        activity.textContent = `${name} is typing...`;
        clearTimeout(activityTimer);
        activityTimer = setTimeout(() => {
            activity.textContent = "";
        }, 3000);
    }
});