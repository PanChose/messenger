import 'dotenv/config'
import express from 'express'
import mongoose from "mongoose"
import cors from 'cors'
import { Server } from "socket.io"
import path from 'path'
import { fileURLToPath } from 'url'
import bcrypt from 'bcryptjs'
import User from './models/User.js'
import Message from './models/Message.js';

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(express.static(path.join(__dirname, 'public')))
app.use(express.json())

const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
            callback(null, true)
        } else {
            callback(new Error('Not allowed by CORS'))
        }
    },
    credentials: true
}))

// --- MongoDB Connection ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => console.error("MongoDB error:", err))

// --- Auth Routes ---
app.post('/auth/register', async (req, res) => {
    const { username, password } = req.body
    try {
        const hashedPassword = await bcrypt.hash(password, 10)
        const newUser = new User({ username, password: hashedPassword })
        await newUser.save()
        res.status(201).json({ message: "User registered" })
    } catch (err) {
        res.status(400).json({ message: "Username already exists" })
    }
})

app.post('/auth/login', async (req, res) => {
    const { username, password } = req.body
    const user = await User.findOne({ username })
    if (user && await bcrypt.compare(password, user.password)) {
        res.json({ message: "Login successful", username })
    } else {
        res.status(401).json({ message: "Invalid credentials" })
    }
})

app.get('/messages/:user1/:user2', async (req, res) => {
    const { user1, user2 } = req.params;
    try {
        const history = await Message.find({
            $or: [
                { sender: user1, recipient: user2 },
                { sender: user2, recipient: user1 }
            ]
        }).sort({ timestamp: 1 }); // Сортируем от старых к новым
        res.json(history);
    } catch (err) {
        res.status(500).json({ message: "Error fetching history" });
    }
});

// --- Search Route (WhatsApp Style) ---
app.get('/users/search', async (req, res) => {
    const { q, me } = req.query
    try {
        const users = await User.find({
            username: { $regex: q, $options: 'i', $ne: me }
        }).limit(10)
        res.json(users.map(u => u.username))
    } catch (err) {
        res.status(500).json({ message: "Search failed" })
    }
})

const expressServer = app.listen(process.env.PORT || 3500, () => {
    console.log(`Server running on port ${process.env.PORT || 3500}`)
})

const io = new Server(expressServer, {
    cors: { origin: allowedOrigins }
})

// Хранилище онлайн-пользователей: { "username": "socketId" }
const onlineUsers = new Map()

io.on('connection', (socket) => {
    console.log(`User ${socket.id} connected`)

    socket.on('enterRoom', ({ name }) => {
        onlineUsers.set(name, socket.id)
        console.log(`${name} is now online`)
    })

    // --- Логика личных сообщений ---
    socket.on('privateMessage', async ({ sender, recipient, text }) => {
        const msgData = buildMsg(sender, text);

        // 1. Сохраняем в базу данных
        const newMessage = new Message({
            sender,
            recipient,
            text: msgData.text,
            time: msgData.time
        });
        await newMessage.save();

        // 2. Отправляем через сокеты как и раньше
        const recipientSocketId = onlineUsers.get(recipient);
        const socketPayload = { ...msgData, isPrivate: true };

        if (recipientSocketId) {
            io.to(recipientSocketId).emit('message', socketPayload);
        }
        socket.emit('message', socketPayload);
    })

    socket.on('activity', (name) => {
        // Оповещаем всех, кто может переписываться с этим человеком
        socket.broadcast.emit('activity', name)
    })

    socket.on('disconnect', () => {
        for (let [name, id] of onlineUsers.entries()) {
            if (id === socket.id) {
                onlineUsers.delete(name)
                break
            }
        }
    })
})

function buildMsg(name, text) {
    return {
        name,
        text,
        time: new Intl.DateTimeFormat('default', {
            hour: 'numeric',
            minute: 'numeric'
        }).format(new Date())
    }
}