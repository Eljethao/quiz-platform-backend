import mongoose, { Document, Schema } from 'mongoose';

export interface IPlayer {
    socketId: string;
    nickname: string;
    score: number;
}

export interface IGameSession extends Document {
    pin: string;
    quizId: mongoose.Types.ObjectId;
    hostId: mongoose.Types.ObjectId;
    players: IPlayer[];
    currentQuestionIndex: number;
    isActive: boolean;
}

const playerSchema = new Schema<IPlayer>({
    socketId: {
        type: String,
        required: true,
    },
    nickname: {
        type: String,
        required: true,
    },
    score: {
        type: Number,
        default: 0,
    }
});

const gameSessionSchema = new Schema<IGameSession>({
    pin: {
        type: String,
        required: true,
        unique: true,
    },
    quizId: {
        type: Schema.Types.ObjectId,
        ref: 'Quiz',
        required: true,
    },
    hostId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    players: [playerSchema],
    currentQuestionIndex: {
        type: Number,
        default: -1, // -1 means lobby
    },
    isActive: {
        type: Boolean,
        default: false,
    }
}, { timestamps: true });

export default mongoose.model<IGameSession>('GameSession', gameSessionSchema);
