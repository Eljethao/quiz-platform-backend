import { Server, Socket } from 'socket.io';
import GameSession from './models/GameSession';
import { IQuestion } from './models/Quiz';

interface PlayerState {
    socketId: string;
    nickname: string;
    avatar: string;
    score: number;
}

interface GameState {
    pin: string;
    quizId: string;
    hostId: string;
    hostSocketId: string;
    players: PlayerState[];
    currentQuestionIndex: number;
    isActive: boolean;
    questionStartTime?: number;
    currentQuestion?: IQuestion;
    answeredPlayerIds?: string[];    // socket IDs (changes on reconnect, used for live tracking)
    answeredNicknames?: Set<string>; // persistent across reconnects — used for rejoin safety
}

// In-memory store for active games: PIN -> GameState
const activeGames = new Map<string, GameState>();

function generatePIN(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

export default function socketManager(io: Server) {
    io.on('connection', (socket: Socket) => {

        // host-join: Host initializes a game room, generating a 6-digit PIN.
        socket.on('host-join', async (data: { quizId: string; hostId: string }) => {
            const { quizId, hostId } = data;

            // Check if this host already has an active game for this quiz, to reconnect them
            let existingPin: string | null = null;
            for (const [pin, g] of activeGames.entries()) {
                if (g.hostId === hostId && g.quizId === quizId) {
                    existingPin = pin;
                    break;
                }
            }

            if (existingPin) {
                // Reconnect existing host
                const game = activeGames.get(existingPin)!;
                game.hostSocketId = socket.id;
                socket.join(existingPin);
                socket.emit('game-created', { pin: existingPin });
                socket.emit('update-lobby', game.players);
                console.log(`Host reconnected to game with PIN: ${existingPin}`);
                return;
            }

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
        });

        // player-join: Player enters PIN and nickname, joining the specific Socket room.
        socket.on('player-join', (data: { pin: string; nickname: string; avatar: string }) => {
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
            } else {
                const player: PlayerState = { socketId: socket.id, nickname, avatar, score: 0 };
                game.players.push(player);
            }

            socket.join(pin);
            socket.emit('joined-lobby', { pin, nickname, avatar });

            // Update lobby display on host side
            io.to(game.hostSocketId).emit('update-lobby', game.players);
            console.log(`Player ${nickname} joined/rejoined game ${pin}.`);

            // Catch-up logic for Player
            if (game.isActive && game.currentQuestion) {
                const alreadyAnswered = game.answeredNicknames?.has(nickname) ?? false;
                if (alreadyAnswered) {
                    socket.emit('already-answered');
                } else {
                    const playerQuestion = {
                        questionText: game.currentQuestion.questionText,
                        options: game.currentQuestion.options,
                        timeLimit: game.currentQuestion.timeLimit,
                    };
                    socket.emit('question-started', playerQuestion);
                }
            }
        });

        // request-current-state: Player or Host explicitly asks for the current game state (e.g., after refresh lost location.state)
        socket.on('request-current-state', (data: { pin: string; isHost?: boolean }) => {
            const { pin, isHost } = data;
            const game = activeGames.get(pin);
            if (!game) return;

            if (isHost && game.hostSocketId === socket.id) {
                // Return host specific recovery details
                socket.emit('host-state-recovered', {
                    currentQuestionIndex: game.currentQuestionIndex,
                    isActive: game.isActive,
                    players: game.players
                });
            } else if (!isHost) {
                // Player recovery
                if (game.isActive && game.currentQuestion) {
                    const player = game.players.find(p => p.socketId === socket.id);
                    const nickname = player?.nickname || '';
                    const alreadyAnswered = game.answeredNicknames?.has(nickname) ?? false;

                    if (alreadyAnswered) {
                        socket.emit('already-answered');
                    } else {
                        const playerQuestion = {
                            questionText: game.currentQuestion.questionText,
                            options: game.currentQuestion.options,
                            timeLimit: game.currentQuestion.timeLimit,
                        };
                        socket.emit('question-started', playerQuestion);
                    }
                }
            }
        });

        // start-game: Host starts the game.
        socket.on('start-game', (pin: string) => {
            const game = activeGames.get(pin);
            if (game && game.hostSocketId === socket.id) {
                game.isActive = true;
                io.to(pin).emit('game-started');
            }
        });

        // next-question: Host sends the next question to all players.
        socket.on('next-question', (data: { pin: string; question: IQuestion }) => {
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
        socket.on('submit-answer', (data: { pin: string; answerIndex: number }) => {
            const { pin, answerIndex } = data;
            const game = activeGames.get(pin);
            if (!game) return;

            const player = game.players.find(p => p.socketId === socket.id);
            if (!player) return;

            // Prevent double-submit (e.g., if the player somehow triggers this twice)
            if (game.answeredNicknames?.has(player.nickname)) return;

            const timeTaken = (Date.now() - (game.questionStartTime || 0)) / 1000;
            let scoreEarned = 0;
            let isCorrect = false;

            if (game.currentQuestion && answerIndex === game.currentQuestion.correctOptionIndex) {
                const timeLimit = game.currentQuestion.timeLimit;
                scoreEarned = Math.max(0, Math.floor(1000 * (1 - (timeTaken / timeLimit / 2))));
                isCorrect = true;
            }

            player.score += scoreEarned;

            if (!game.answeredPlayerIds) game.answeredPlayerIds = [];
            game.answeredPlayerIds.push(socket.id);
            game.answeredNicknames?.add(player.nickname); // track by nickname for rejoin safety

            socket.emit('answer-result', { isCorrect, score: player.score, scoreEarned });
            io.to(game.hostSocketId).emit('player-answered', { answerIndex });
        });

        // time-up: Host's timer expired. Broadcast timeout to everyone in the room.
        socket.on('time-up', (pin: string) => {
            const game = activeGames.get(pin);
            if (game && game.hostSocketId === socket.id) {
                // Send timeout signal to players who haven't answered yet
                game.players.forEach(p => {
                    const hasAnswered = game.answeredNicknames?.has(p.nickname) ?? false;
                    if (!hasAnswered) {
                        io.to(p.socketId).emit('answer-result', { isCorrect: false, score: p.score, scoreEarned: 0, isTimeout: true });
                        game.answeredNicknames?.add(p.nickname); // mark as "handled"
                    }
                });
            }
        });

        // show-leaderboard: Send sorted scores to everyone.
        socket.on('show-leaderboard', (data: { pin: string; isFinal?: boolean }) => {
            const pin = typeof data === 'string' ? data : data.pin; // fallback for older clients
            const game = activeGames.get(pin);
            if (game && game.hostSocketId === socket.id) {
                const sortedPlayers = [...game.players].sort((a, b) => b.score - a.score);
                const isFinal = typeof data === 'object' ? data.isFinal : false;
                io.to(pin).emit('leaderboard', { players: sortedPlayers, isFinal });
            }
        });

        socket.on('disconnect', () => {
            // Intentionally left minimal — player state is preserved in activeGames for rejoin
        });
    });
};
