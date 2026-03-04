import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from './models/User';
import Quiz from './models/Quiz';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI as string;

const seedDatabase = async () => {
    try {
        console.log(`Connecting to ${MONGODB_URI}...`);
        await mongoose.connect(MONGODB_URI);
        console.log('Connected. Dropping previous DB...');
        await mongoose.connection.db?.dropDatabase();

        // 1. Create a User
        console.log('Creating sample user...');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('password123', salt);

        const user = new User({
            username: 'kahoot_master',
            email: 'host@kahoot.com',
            password: hashedPassword,
        });
        const savedUser = await user.save();
        console.log(`User created: ${savedUser.email} / password123`);

        // 2. Create a Quiz
        console.log('Creating sample quizzes...');
        const dummyQuiz1 = new Quiz({
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

        const dummyQuiz2 = new Quiz({
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

        await dummyQuiz1.save();
        await dummyQuiz2.save();
        console.log('Quizzes created.');

        console.log('Seeding complete!');
        process.exit(0);

    } catch (err) {
        console.error('Error seeding DB:', err);
        process.exit(1);
    }
};

seedDatabase();
