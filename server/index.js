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

app.use(express.static(path.join(__dirname, "../public")))
app.use(express.json())
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || origin.startsWith("http://localhost:63342")) {
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
    cors: { origin: "*" }
})

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


// state
const UsersState = {
    users: [],
    setUsers: function (newUsersArray) {
        this.users = newUsersArray
    }
}

io.on('connection', socket => {
    console.log(`User ${socket.id} connected`)

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
    socket.on('activity', (name) => {
        const room = getUser(socket.id)?.room
        if (room) {
            socket.broadcast.to(room).emit('activity', name)
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