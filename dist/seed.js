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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const User_1 = __importDefault(require("./models/User"));
const Quiz_1 = __importDefault(require("./models/Quiz"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const MONGODB_URI = process.env.MONGODB_URI;
const seedDatabase = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log(`Connecting to ${MONGODB_URI}...`);
        yield mongoose_1.default.connect(MONGODB_URI);
        console.log('Connected. Dropping previous DB...');
        yield ((_a = mongoose_1.default.connection.db) === null || _a === void 0 ? void 0 : _a.dropDatabase());
        // 1. Create a User
        console.log('Creating sample user...');
        const salt = yield bcrypt_1.default.genSalt(10);
        const hashedPassword = yield bcrypt_1.default.hash('password123', salt);
        const user = new User_1.default({
            username: 'kahoot_master',
            email: 'host@kahoot.com',
            password: hashedPassword,
        });
        const savedUser = yield user.save();
        console.log(`User created: ${savedUser.email} / password123`);
        // 2. Create a Quiz
        console.log('Creating sample quizzes...');
        const dummyQuiz1 = new Quiz_1.default({
            title: 'General Knowledge Trivia',
            creatorId: savedUser._id,
            questions: [
                {
                    questionText: 'What is the capital of France?',
                    options: ['London', 'Berlin', 'Paris', 'Madrid'],
                    correctOptionIndex: 2,
                    timeLimit: 20
                },
                {
                    questionText: 'Which planet is known as the Red Planet?',
                    options: ['Earth', 'Mars', 'Jupiter', 'Saturn'],
                    correctOptionIndex: 1,
                    timeLimit: 15
                },
                {
                    questionText: 'What is 5 x 7?',
                    options: ['30', '35', '40', '42'],
                    correctOptionIndex: 1,
                    timeLimit: 10
                }
            ]
        });
        const dummyQuiz2 = new Quiz_1.default({
            title: 'Programming Basics',
            creatorId: savedUser._id,
            questions: [
                {
                    questionText: 'Which keyword is used to declare a constant variable in JavaScript?',
                    options: ['let', 'var', 'const', 'def'],
                    correctOptionIndex: 2,
                    timeLimit: 20
                },
                {
                    questionText: 'What does HTML stand for?',
                    options: ['Hyper Tool Markup Logic', 'Hyper Text Markup Language', 'Home Tool Markup Language', 'Hyperlink Text Module Language'],
                    correctOptionIndex: 1,
                    timeLimit: 20
                }
            ]
        });
        yield dummyQuiz1.save();
        yield dummyQuiz2.save();
        console.log('Quizzes created.');
        console.log('Seeding complete!');
        process.exit(0);
    }
    catch (err) {
        console.error('Error seeding DB:', err);
        process.exit(1);
    }
});
seedDatabase();
