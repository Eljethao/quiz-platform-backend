import express, { Response } from 'express';
import auth, { AuthRequest } from '../middleware/auth';
import Quiz, { IQuiz } from '../models/Quiz';

const router = express.Router();

// @route   POST api/quizzes
// @desc    Create a quiz
// @access  Private
router.post('/', auth, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { title, questions } = req.body;
        const newQuiz = new Quiz({
            title,
            questions,
            creatorId: req.user?.id
        });
        const quiz = await newQuiz.save();
        res.json(quiz);
    } catch (err: any) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/quizzes
// @desc    Get all quizzes for user
// @access  Private
router.get('/', auth, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const quizzes = await Quiz.find({ creatorId: req.user?.id }).sort({ createdAt: -1 });
        res.json(quizzes);
    } catch (err: any) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/quizzes/:id
// @desc    Get quiz by ID
// @access  Public (so players can fetch it if needed during game, though socket will handle most)
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) {
            res.status(404).json({ msg: 'Quiz not found' });
            return;
        }
        res.json(quiz);
    } catch (err: any) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            res.status(404).json({ msg: 'Quiz not found' });
            return;
        }
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/quizzes/:id
// @desc    Update a quiz
// @access  Private
router.put('/:id', auth, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        let quiz = await Quiz.findById(req.params.id);
        if (!quiz) {
            res.status(404).json({ msg: 'Quiz not found' });
            return;
        }

        // Check user
        if (quiz.creatorId.toString() !== req.user?.id) {
            res.status(401).json({ msg: 'User not authorized' });
            return;
        }

        quiz = await Quiz.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true }
        );
        res.json(quiz);
    } catch (err: any) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE api/quizzes/:id
// @desc    Delete a quiz
// @access  Private
router.delete('/:id', auth, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) {
            res.status(404).json({ msg: 'Quiz not found' });
            return;
        }

        // Check user
        if (quiz.creatorId.toString() !== req.user?.id) {
            res.status(401).json({ msg: 'User not authorized' });
            return;
        }

        await quiz.deleteOne();
        res.json({ msg: 'Quiz removed' });
    } catch (err: any) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            res.status(404).json({ msg: 'Quiz not found' });
            return;
        }
        res.status(500).send('Server Error');
    }
});

export default router;
