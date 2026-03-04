"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = socketManager;
// In-memory store for active games: PIN -> GameState
const activeGames = new Map();
function generatePIN() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
function socketManager(io) {
    io.on('connection', (socket) => {
        // host-join: Host initializes a game room, generating a 6-digit PIN.
        socket.on('host-join', (data) => __awaiter(this, void 0, void 0, function* () {
            const { quizId, hostId } = data;
            const pin = generatePIN();
            // create game state
            activeGames.set(pin, {
                pin,
                quizId,
                hostId,
                hostSocketId: socket.id,
                players: [],
                currentQuestionIndex: -1,
                isActive: false
            });
            socket.join(pin);
            socket.emit('game-created', { pin });
            console.log(`Host created game with PIN: ${pin}`);
        }));
        // player-join: Player enters PIN and nickname, joining the specific Socket room. Emit to host to update lobby.
        socket.on('player-join', (data) => {
            const { pin, nickname, avatar } = data;
            const game = activeGames.get(pin);
            if (!game) {
                socket.emit('error', 'Game not found');
                return;
            }
            // Check if player is rejoining
            const existingPlayerIndex = game.players.findIndex(p => p.nickname === nickname);
            if (existingPlayerIndex !== -1) {
                // Re-connect the existing player
                game.players[existingPlayerIndex].socketId = socket.id;
                game.players[existingPlayerIndex].avatar = avatar; // Update avatar if it changed
            }
            else {
                // Add new player
                const player = { socketId: socket.id, nickname, avatar, score: 0 };
                game.players.push(player);
            }
            socket.join(pin);
            socket.emit('joined-lobby', { pin, nickname, avatar });
            // Emit to host to update lobby
            io.to(game.hostSocketId).emit('update-lobby', game.players);
            console.log(`Player ${nickname} joined game ${pin}. Avatar length: ${(avatar === null || avatar === void 0 ? void 0 : avatar.length) || 0}`);
            // If a game is currently active and a question is running, catch the player up
            if (game.isActive && game.currentQuestion) {
                const playerQuestion = {
                    questionText: game.currentQuestion.questionText,
                    options: game.currentQuestion.options,
                    timeLimit: game.currentQuestion.timeLimit,
                };
                // Emit only to this specific rejoining player
                socket.emit('question-started', playerQuestion);
            }
        });
        // start-game: Host starts the game. Emit to room to switch to question view.
        socket.on('start-game', (pin) => {
            const game = activeGames.get(pin);
            if (game && game.hostSocketId === socket.id) {
                game.isActive = true;
                io.to(pin).emit('game-started');
            }
        });
        // next-question: Send question data (excluding correct answer) to players. Send full data to Host screen.
        socket.on('next-question', (data) => {
            const { pin, question } = data; // Host sends full question object
            const game = activeGames.get(pin);
            if (game && game.hostSocketId === socket.id) {
                game.currentQuestionIndex++;
                // Start time for score calculation
                game.questionStartTime = Date.now();
                game.currentQuestion = question; // store question to calculate scores later
                game.answeredPlayerIds = []; // reset who answered
                // Send stripped down question to players 
                const playerQuestion = {
                    questionText: question.questionText,
                    options: question.options, // Send actual option text, not just indices
                    timeLimit: question.timeLimit,
                };
                socket.broadcast.to(pin).emit('question-started', playerQuestion);
                // host knows the full question anyway from their frontend state
            }
        });
        // submit-answer: Calculate score based on correct answer and time taken.
        socket.on('submit-answer', (data) => {
            const { pin, answerIndex } = data;
            const game = activeGames.get(pin);
            if (!game)
                return;
            const player = game.players.find(p => p.socketId === socket.id);
            if (!player)
                return;
            const timeTaken = (Date.now() - (game.questionStartTime || 0)) / 1000;
            let scoreEarned = 0;
            let isCorrect = false;
            if (game.currentQuestion && answerIndex === game.currentQuestion.correctOptionIndex) {
                // simple score calculation based on max 1000 pts per question, minus time penalty
                const timeLimit = game.currentQuestion.timeLimit;
                scoreEarned = Math.max(0, Math.floor(1000 * (1 - (timeTaken / timeLimit / 2))));
                isCorrect = true;
            }
            player.score += scoreEarned;
            if (!game.answeredPlayerIds)
                game.answeredPlayerIds = [];
            game.answeredPlayerIds.push(player.socketId);
            // Send result back to player
            socket.emit('answer-result', { isCorrect, score: player.score, scoreEarned });
            // Update host with real-time answer graph
            io.to(game.hostSocketId).emit('player-answered', { answerIndex });
        });
        // time-up: Host signifies that the timer for the current question ran out.
        socket.on('time-up', (pin) => {
            const game = activeGames.get(pin);
            if (game && game.hostSocketId === socket.id) {
                // Broadcast to the whole room that time is up, so the frontend can route them to the wait screen even if socketId mismatched
                io.to(pin).emit('answer-result', { isCorrect: false, score: 0, scoreEarned: 0, isTimeout: true });
                // For scoring purposes, also cleanly iterate over players who haven't answered
                game.players.forEach(p => {
                    var _a, _b;
                    const hasAnswered = ((_a = game.answeredPlayerIds) === null || _a === void 0 ? void 0 : _a.includes(p.socketId)) || ((_b = game.answeredPlayerIds) === null || _b === void 0 ? void 0 : _b.includes(p.nickname));
                    if (!hasAnswered) {
                        // They score 0
                    }
                });
            }
        });
        // show-leaderboard: Send updated scores to the Host screen.
        socket.on('show-leaderboard', (pin) => {
            const game = activeGames.get(pin);
            if (game && game.hostSocketId === socket.id) {
                const sortedPlayers = [...game.players].sort((a, b) => b.score - a.score);
                io.to(pin).emit('leaderboard', sortedPlayers);
            }
        });
        socket.on('disconnect', () => {
            // Find if it was a player or host
            // In a robust app, we'd handle cleanup here. Leaving simple for now.
        });
    });
}
;
