import 'dotenv/config'
import express from 'express'
import mongoose from "mongoose";
import cors from 'cors'
import { Server } from "socket.io"
import path from 'path'
import { fileURLToPath } from 'url'
import bcrypt from 'bcryptjs'
import User from './models/User.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ADMIN = "Admin"

const app = express()

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json())

const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

// connect to server
const expressServer = app.listen(process.env.PORT || 3500, () => {
    console.log(`Server running on port: ${process.env.PORT || 3500}`)
})

const io = new Server(expressServer, {
    cors: {
        origin: allowedOrigins.length > 0 ? allowedOrigins : "*",
        methods: ["GET", "POST"],
        credentials: true
    }
});

// connect to db
mongoose.connect(process.env.MONGO_URI).then(r => {
    console.log("DB connected")
})

// --- Registration API Endpoint ---
app.post('/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        // 1. Basic validation
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Username and password are required."
            });
        }

        // 2. Check if user already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "This username is already taken."
            });
        }

        // 3. Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 4. Create and save user
        const newUser = new User({
            username,
            password: hashedPassword
        });

        await newUser.save();

        // 5. Success response
        return res.status(201).json({
            success: true,
            message: "User registered successfully!",
            userId: newUser._id
        });

    } catch (error) {
        console.error("Registration Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
});

// --- Login API Endpoint ---
app.post('/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // 1. Basic validation
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Username and password are required."
            });
        }

        // 2. Find user by username
        const user = await User.findOne({ username });
        if (!user) {
            // Using generic message for security reasons
            return res.status(401).json({
                success: false,
                message: "Invalid username or password."
            });
        }

        // 3. Compare provided password with hashed password in DB
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password."
            });
        }

        // 4. Success response
        // Note: In a real app, you would generate a JWT token here
        return res.status(200).json({
            success: true,
            message: `Welcome back, ${user.username}!`,
            userId: user._id
        });

    } catch (error) {
        console.error("Login Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error during login."
        });
    }
});

// state
const UsersState = {
    users: [],
    setUsers: function (newUsersArray) {
        this.users = newUsersArray
    }
}

io.on('connection', socket => {
    console.log(`User ${socket.id} connected`)

    socket.emit('roomList', { rooms: getAllActiveRooms() })

    // Upon connection - only to user
    socket.emit('message', buildMsg(ADMIN, "Welcome to Chat App!"))

    socket.on('enterRoom', ({ name, room }) => {

        // leave previous room
        const prevRoom = getUser(socket.id)?.room

        if (prevRoom) {
            socket.leave(prevRoom)
            io.to(prevRoom).emit('message', buildMsg(ADMIN, `${name} has left the room`))
        }

        const user = activateUser(socket.id, name, room)

        // Cannot update previous room users list until after the state update in activate user
        if (prevRoom) {
            io.to(prevRoom).emit('userList', {
                users: getUsersInRoom(prevRoom)
            })
        }
        // first comment now 

        // join room
        socket.join(user.room)

        // To user who joined
        socket.emit('message', buildMsg(ADMIN, `You have joined the ${user.room} chat room`))

        // To everyone else
        socket.broadcast.to(user.room).emit('message', buildMsg(ADMIN, `${user.name} has joined the room`))

        // Update user list for room
        io.to(user.room).emit('userList', {
            users: getUsersInRoom(user.room)
        })


        // Update rooms list for everyone
        io.emit('roomList', {
            rooms: getAllActiveRooms()
        })
    })

    // When user disconnects - to all others
    socket.on('disconnect', () => {
        const user = getUser(socket.id)
        userLeavesApp(socket.id)

        if (user) {
            io.to(user.room).emit('message', buildMsg(ADMIN, `${user.name} has left the room`))

            io.to(user.room).emit('userList', {
                users: getUsersInRoom(user.room)
            })

            io.emit('roomList', {
                rooms: getAllActiveRooms()
            })
        }

        console.log(`User ${socket.id} disconnected`)
    })

    // Listening for a message event
    socket.on('message', ({ name, text }) => {
        const room = getUser(socket.id)?.room
        if (room) {
            io.to(room).emit('message', buildMsg(name, text))
        }
    })

    // Listen for activity
    socket.on('message', ({ name, text }) => {
        const room = getUser(socket.id)?.room
        if (room) {
            io.to(room).emit('message', buildMsg(name, text))
        }
    })

    // --- НОВЫЙ КОД: Личные сообщения ---
    socket.on('privateMessage', ({ sender, recipient, text }) => {
        // Ищем получателя среди всех активных пользователей
        const targetUser = UsersState.users.find(u => u.name === recipient);

        if (targetUser) {
            const msg = buildMsg(sender, text);
            msg.isPrivate = true; // Добавляем флаг, что это ЛС

            // Отправляем получателю
            io.to(targetUser.id).emit('message', msg);
            // Отправляем обратно отправителю, чтобы он тоже видел свое сообщение
            socket.emit('message', msg);
        } else {
            // Если пользователь вышел
            socket.emit('message', buildMsg(ADMIN, `User ${recipient} is not online.`));
        }
    })
})

function buildMsg(name, text) {
    return {
        name,
        text,
        time: new Intl.DateTimeFormat('default', {
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric'
        }).format(new Date())
    }
}

// User functions
function activateUser(id, name, room) {
    const user = { id, name, room }
    UsersState.setUsers([
        ...UsersState.users.filter(user => user.id !== id),
        user
    ])
    return user
}

function userLeavesApp(id) {
    UsersState.setUsers(
        UsersState.users.filter(user => user.id !== id)
    )
}

function getUser(id) {
    return UsersState.users.find(user => user.id === id)
}

function getUsersInRoom(room) {
    return UsersState.users.filter(user => user.room === room)
}

function getAllActiveRooms() {
    return Array.from(new Set(UsersState.users.map(user => user.room)))
}