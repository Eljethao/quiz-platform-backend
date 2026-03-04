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
            activeGames.set(pin, {
                pin,
                quizId,
                hostId,
                hostSocketId: socket.id,
                players: [],
                currentQuestionIndex: -1,
                isActive: false,
                answeredNicknames: new Set()
            });
            socket.join(pin);
            socket.emit('game-created', { pin });
            console.log(`Host created game with PIN: ${pin}`);
        }));
        // player-join: Player enters PIN and nickname, joining the specific Socket room.
        socket.on('player-join', (data) => {
            var _a, _b;
            const { pin, nickname, avatar } = data;
            const game = activeGames.get(pin);
            if (!game) {
                socket.emit('error', 'Game not found');
                return;
            }
            // Check if player is rejoining (by nickname — persistent across reconnects)
            const existingPlayerIndex = game.players.findIndex(p => p.nickname === nickname);
            if (existingPlayerIndex !== -1) {
                // Update socket ID to the new connection
                game.players[existingPlayerIndex].socketId = socket.id;
                game.players[existingPlayerIndex].avatar = avatar;
            }
            else {
                const player = { socketId: socket.id, nickname, avatar, score: 0 };
                game.players.push(player);
            }
            socket.join(pin);
            socket.emit('joined-lobby', { pin, nickname, avatar });
            // Update lobby display on host side
            io.to(game.hostSocketId).emit('update-lobby', game.players);
            console.log(`Player ${nickname} joined/rejoined game ${pin}.`);
            // Catch-up logic: if a question is active AND this player hasn't answered yet,
            // send them the current question so they can still participate.
            // IMPORTANT: if they already answered, send 'already-answered' so the
            // frontend knows to show "Waiting for others..." instead of resetting.
            if (game.isActive && game.currentQuestion) {
                const alreadyAnswered = (_b = (_a = game.answeredNicknames) === null || _a === void 0 ? void 0 : _a.has(nickname)) !== null && _b !== void 0 ? _b : false;
                if (alreadyAnswered) {
                    // Tell the frontend to stay on the waiting screen
                    socket.emit('already-answered');
                }
                else {
                    const playerQuestion = {
                        questionText: game.currentQuestion.questionText,
                        options: game.currentQuestion.options,
                        timeLimit: game.currentQuestion.timeLimit,
                    };
                    socket.emit('question-started', playerQuestion);
                }
            }
        });
        // start-game: Host starts the game.
        socket.on('start-game', (pin) => {
            const game = activeGames.get(pin);
            if (game && game.hostSocketId === socket.id) {
                game.isActive = true;
                io.to(pin).emit('game-started');
            }
        });
        // next-question: Host sends the next question to all players.
        socket.on('next-question', (data) => {
            const { pin, question } = data;
            const game = activeGames.get(pin);
            if (game && game.hostSocketId === socket.id) {
                game.currentQuestionIndex++;
                game.questionStartTime = Date.now();
                game.currentQuestion = question;
                game.answeredPlayerIds = [];
                game.answeredNicknames = new Set(); // reset per-question answered set
                const playerQuestion = {
                    questionText: question.questionText,
                    options: question.options,
                    timeLimit: question.timeLimit,
                };
                socket.broadcast.to(pin).emit('question-started', playerQuestion);
            }
        });
        // submit-answer: Player submits an answer. Score is calculated server-side.
        socket.on('submit-answer', (data) => {
            var _a, _b;
            const { pin, answerIndex } = data;
            const game = activeGames.get(pin);
            if (!game)
                return;
            const player = game.players.find(p => p.socketId === socket.id);
            if (!player)
                return;
            // Prevent double-submit (e.g., if the player somehow triggers this twice)
            if ((_a = game.answeredNicknames) === null || _a === void 0 ? void 0 : _a.has(player.nickname))
                return;
            const timeTaken = (Date.now() - (game.questionStartTime || 0)) / 1000;
            let scoreEarned = 0;
            let isCorrect = false;
            if (game.currentQuestion && answerIndex === game.currentQuestion.correctOptionIndex) {
                const timeLimit = game.currentQuestion.timeLimit;
                scoreEarned = Math.max(0, Math.floor(1000 * (1 - (timeTaken / timeLimit / 2))));
                isCorrect = true;
            }
            player.score += scoreEarned;
            if (!game.answeredPlayerIds)
                game.answeredPlayerIds = [];
            game.answeredPlayerIds.push(socket.id);
            (_b = game.answeredNicknames) === null || _b === void 0 ? void 0 : _b.add(player.nickname); // track by nickname for rejoin safety
            socket.emit('answer-result', { isCorrect, score: player.score, scoreEarned });
            io.to(game.hostSocketId).emit('player-answered', { answerIndex });
        });
        // time-up: Host's timer expired. Broadcast timeout to everyone in the room.
        socket.on('time-up', (pin) => {
            const game = activeGames.get(pin);
            if (game && game.hostSocketId === socket.id) {
                // Send timeout signal to players who haven't answered yet
                game.players.forEach(p => {
                    var _a, _b, _c;
                    const hasAnswered = (_b = (_a = game.answeredNicknames) === null || _a === void 0 ? void 0 : _a.has(p.nickname)) !== null && _b !== void 0 ? _b : false;
                    if (!hasAnswered) {
                        io.to(p.socketId).emit('answer-result', { isCorrect: false, score: p.score, scoreEarned: 0, isTimeout: true });
                        (_c = game.answeredNicknames) === null || _c === void 0 ? void 0 : _c.add(p.nickname); // mark as "handled"
                    }
                });
            }
        });
        // show-leaderboard: Send sorted scores to everyone.
        socket.on('show-leaderboard', (pin) => {
            const game = activeGames.get(pin);
            if (game && game.hostSocketId === socket.id) {
                const sortedPlayers = [...game.players].sort((a, b) => b.score - a.score);
                io.to(pin).emit('leaderboard', sortedPlayers);
            }
        });
        socket.on('disconnect', () => {
            // Intentionally left minimal — player state is preserved in activeGames for rejoin
        });
    });
}
;
