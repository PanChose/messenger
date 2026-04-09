import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
    sender: { type: String, required: true },
    recipient: { type: String, required: true }, // Для личных сообщений
    text: { type: String, required: true },
    time: { type: String, required: true },
    timestamp: { type: Date, default: Date.now } // Для сортировки по времени
});

export default mongoose.model('Message', MessageSchema);