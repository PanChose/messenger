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
const usersList = document.querySelector('.user-list');
const roomList = document.querySelector('.room-list');

let isLoginMode = true;
let currentRoom = ""; // Store the room we are currently in

// --- FIXED: Auth UI Toggle ---
// Instead of innerHTML, we change only text nodes to keep event listeners alive
authToggle.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
        e.preventDefault();
        isLoginMode = !isLoginMode;

        authTitle.innerText = isLoginMode ? 'Login' : 'Register';
        authSubmit.innerText = isLoginMode ? 'Login' : 'Register';

        const link = authToggle.querySelector('a');
        const text = authToggle.childNodes[0];

        if (isLoginMode) {
            text.textContent = "Don't have an account? ";
            link.textContent = "Register";
        } else {
            text.textContent = "Already have an account? ";
            link.textContent = "Login";
        }
        authMessage.innerText = ""; // Clear messages on toggle
    }
});

// --- Handle Login/Register ---
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const usernameInput = document.getElementById('username-input');
    const passwordInput = document.getElementById('password-input');

    const username = usernameInput.value;
    const password = passwordInput.value;
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
                // SUCCESS REGISTRATION: Clear and Switch to Login
                usernameInput.value = '';
                passwordInput.value = '';
                isLoginMode = true;

                // Trigger visual toggle back to login
                authTitle.innerText = 'Login';
                authSubmit.innerText = 'Login';
                authToggle.childNodes[0].textContent = "Don't have an account? ";
                authToggle.querySelector('a').textContent = "Register";

                authMessage.style.color = 'green';
                authMessage.innerText = "Registration successful! Now login.";
            } else {
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
    nameInput.value = username;
}

// --- FIXED: Prevent entering the same room ---
function enterRoom(e) {
    e.preventDefault();
    const targetRoom = chatRoom.value.trim();

    if (!nameInput.value || !targetRoom) return;

    if (targetRoom === currentRoom) {
        alert("You are already in this room!"); // Simple alert or status message
        return;
    }

    socket.emit('enterRoom', {
        name: nameInput.value,
        room: targetRoom
    });

    currentRoom = targetRoom; // Update current room
    document.querySelector('#current-room-display').textContent = targetRoom;
    chatDisplay.innerHTML = ""; // Clear chat when switching rooms
}