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
    answeredPlayerIds?: string[];
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
        });

        // player-join: Player enters PIN and nickname, joining the specific Socket room. Emit to host to update lobby.
        socket.on('player-join', (data: { pin: string; nickname: string; avatar: string }) => {
            const { pin, nickname, avatar } = data;
            const game = activeGames.get(pin);

            if (!game) {
                socket.emit('error', 'Game not found');
                return;
            }

            const player: PlayerState = { socketId: socket.id, nickname, avatar, score: 0 };
            game.players.push(player);

            socket.join(pin);
            socket.emit('joined-lobby', { pin, nickname, avatar });

            // Emit to host to update lobby
            io.to(game.hostSocketId).emit('update-lobby', game.players);
            console.log(`Player ${nickname} joined game ${pin}. Avatar length: ${avatar?.length || 0}`);
        });

        // start-game: Host starts the game. Emit to room to switch to question view.
        socket.on('start-game', (pin: string) => {
            const game = activeGames.get(pin);
            if (game && game.hostSocketId === socket.id) {
                game.isActive = true;
                io.to(pin).emit('game-started');
            }
        });

        // next-question: Send question data (excluding correct answer) to players. Send full data to Host screen.
        socket.on('next-question', (data: { pin: string; question: IQuestion }) => {
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
        socket.on('submit-answer', (data: { pin: string; answerIndex: number }) => {
            const { pin, answerIndex } = data;
            const game = activeGames.get(pin);
            if (!game) return;

            const player = game.players.find(p => p.socketId === socket.id);
            if (!player) return;

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

            if (!game.answeredPlayerIds) game.answeredPlayerIds = [];
            game.answeredPlayerIds.push(player.socketId);

            // Send result back to player
            socket.emit('answer-result', { isCorrect, score: player.score, scoreEarned });

            // Update host with real-time answer graph
            io.to(game.hostSocketId).emit('player-answered', { answerIndex });
        });

        // time-up: Host signifies that the timer for the current question ran out.
        socket.on('time-up', (pin: string) => {
            const game = activeGames.get(pin);
            if (game && game.hostSocketId === socket.id) {
                // For all players who haven't answered, send them a timeout result
                game.players.forEach(p => {
                    const hasAnswered = game.answeredPlayerIds?.includes(p.socketId);
                    if (!hasAnswered) {
                        // send result: false, 0 points earned
                        io.to(p.socketId).emit('answer-result', { isCorrect: false, score: p.score, scoreEarned: 0 });
                    }
                });
            }
        });

        // show-leaderboard: Send updated scores to the Host screen.
        socket.on('show-leaderboard', (pin: string) => {
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
};
