"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const mongoose_1 = __importDefault(require("mongoose"));
const cors_1 = __importDefault(require("cors"));
const socket_io_1 = require("socket.io");
const auth_1 = __importDefault(require("./routes/auth"));
const quizzes_1 = __importDefault(require("./routes/quizzes"));
const socketManager_1 = __importDefault(require("./socketManager"));
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
// Configure Socket.io
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*', // Default to allow all for dev, tighten in production
        methods: ['GET', 'POST']
    }
});
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Routes
app.use('/api/auth', auth_1.default);
app.use('/api/quizzes', quizzes_1.default);
// Health check route
app.get('/health', (_req, res) => {
    var _a;
    const dbState = mongoose_1.default.connection.readyState;
    const dbStatus = (_a = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState]) !== null && _a !== void 0 ? _a : 'unknown';
    res.status(dbState === 1 ? 200 : 503).json({
        status: dbState === 1 ? 'ok' : 'degraded',
        uptime: Math.floor(process.uptime()),
        database: dbStatus,
        timestamp: new Date().toISOString()
    });
});
// Database connection
const MONGODB_URI = process.env.MONGODB_URI;
mongoose_1.default.connect(MONGODB_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log('MongoDB connection error:', err));
// Socket.io Game Engine (Real-Time)
(0, socketManager_1.default)(io);
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
