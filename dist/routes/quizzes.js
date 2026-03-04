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
const express_1 = __importDefault(require("express"));
const auth_1 = __importDefault(require("../middleware/auth"));
const Quiz_1 = __importDefault(require("../models/Quiz"));
const router = express_1.default.Router();
// @route   POST api/quizzes
// @desc    Create a quiz
// @access  Private
router.post('/', auth_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { title, questions } = req.body;
        const newQuiz = new Quiz_1.default({
            title,
            questions,
            creatorId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.id
        });
        const quiz = yield newQuiz.save();
        res.json(quiz);
    }
    catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
}));
// @route   GET api/quizzes
// @desc    Get all quizzes for user
// @access  Private
router.get('/', auth_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const quizzes = yield Quiz_1.default.find({ creatorId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.id }).sort({ createdAt: -1 });
        res.json(quizzes);
    }
    catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
}));
// @route   GET api/quizzes/:id
// @desc    Get quiz by ID
// @access  Public (so players can fetch it if needed during game, though socket will handle most)
router.get('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const quiz = yield Quiz_1.default.findById(req.params.id);
        if (!quiz) {
            res.status(404).json({ msg: 'Quiz not found' });
            return;
        }
        res.json(quiz);
    }
    catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            res.status(404).json({ msg: 'Quiz not found' });
            return;
        }
        res.status(500).send('Server Error');
    }
}));
// @route   PUT api/quizzes/:id
// @desc    Update a quiz
// @access  Private
router.put('/:id', auth_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        let quiz = yield Quiz_1.default.findById(req.params.id);
        if (!quiz) {
            res.status(404).json({ msg: 'Quiz not found' });
            return;
        }
        // Check user
        if (quiz.creatorId.toString() !== ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id)) {
            res.status(401).json({ msg: 'User not authorized' });
            return;
        }
        quiz = yield Quiz_1.default.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
        res.json(quiz);
    }
    catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
}));
// @route   DELETE api/quizzes/:id
// @desc    Delete a quiz
// @access  Private
router.delete('/:id', auth_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const quiz = yield Quiz_1.default.findById(req.params.id);
        if (!quiz) {
            res.status(404).json({ msg: 'Quiz not found' });
            return;
        }
        // Check user
        if (quiz.creatorId.toString() !== ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id)) {
            res.status(401).json({ msg: 'User not authorized' });
            return;
        }
        yield quiz.deleteOne();
        res.json({ msg: 'Quiz removed' });
    }
    catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            res.status(404).json({ msg: 'Quiz not found' });
            return;
        }
        res.status(500).send('Server Error');
    }
}));
exports.default = router;
