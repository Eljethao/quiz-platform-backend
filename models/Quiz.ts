import mongoose, { Document, Schema } from 'mongoose';

export interface IQuestion {
    questionText: string;
    options: string[];
    correctOptionIndex: number;
    timeLimit: number;
}

export interface IQuiz extends Document {
    title: string;
    creatorId: mongoose.Types.ObjectId;
    questions: IQuestion[];
}

const questionSchema = new Schema<IQuestion>({
    questionText: {
        type: String,
        required: true,
    },
    options: {
        type: [String],
        required: true,
        validate: [(v: string[]) => v.length >= 2 && v.length <= 4, 'Options must be between 2 and 4']
    },
    correctOptionIndex: {
        type: Number,
        required: true,
        min: 0,
        max: 3,
    },
    timeLimit: {
        type: Number,
        required: true,
        default: 20, // seconds
    }
});

const quizSchema = new Schema<IQuiz>({
    title: {
        type: String,
        required: true,
    },
    creatorId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    questions: [questionSchema]
}, { timestamps: true });

export default mongoose.model<IQuiz>('Quiz', quizSchema);
