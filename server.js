const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Multer setup for file uploads
const upload = multer({ dest: 'uploads/' });

const PORT = process.env.PORT || 3000;

// Serve static files (HTML, CSS, JS) from the root directory
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// --- Mocking @resume-skill-mapper and @interviewer-pro ---
const resumeSkillMapper = {
    process: async (filePath) => {
        // Simulating @resume-skill-mapper processing
        console.log(`Processing file: ${filePath}`);
        return {
            skills: ['JavaScript', 'React', 'Node.js', 'MongoDB', 'AI'],
            experience: 'Senior Software Engineer',
            education: 'BS in Computer Science'
        };
    }
};

const interviewerPro = {
    generateQuestions: async (data) => {
        // Simulating @interviewer-pro question generation
        return [
            `Based on your experience as a ${data.experience}, how do you approach scaling Node.js applications?`,
            `Your skills include ${data.skills.join(', ')}. Can you explain a complex problem you solved using ${data.skills[0]}?`,
            `How have you integrated AI into your recent projects, given your background in ${data.education}?`
        ];
    }
};

// --- API Route for Resume Analysis ---
app.post('/api/interview/analyze', upload.single('resume'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No resume file uploaded' });
        }

        const company = req.body.company || 'Unknown Company';
        
        // Step 1: Process file with @resume-skill-mapper
        const processedData = await resumeSkillMapper.process(req.file.path);
        
        // Step 2: Generate questions with @interviewer-pro
        const questions = await interviewerPro.generateQuestions({
            ...processedData,
            company
        });

        // Step 3: Create a new MongoDB session
        const newSession = new InterviewSession({
            company,
            resumeName: req.file.originalname,
            history: [] // Initially empty, history will be filled via WebSocket
        });
        const savedSession = await newSession.save();

        res.json({
            sessionId: savedSession._id,
            questions,
            skills: processedData.skills
        });

    } catch (error) {
        console.error('Error in /api/interview/analyze:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- 1. MONGODB CONNECTION ---
// Connects to a local database named 'interview_coach'
const connectDB = async () => {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/interview_coach');
        console.log("✅ MongoDB Connected: NextGen Database Active");
    } catch (err) {
        console.error("❌ MongoDB Connection Error (Ensure MongoDB is running!):", err.message);
        // We'll still let the server run, but DB features will fail gracefully
    }
};
connectDB();

// --- 2. DATABASE SCHEMA [cite: 42] ---
// Defines how student interview data is stored
const interviewSchema = new mongoose.Schema({
    company: String,
    resumeName: String,
    date: { type: Date, default: Date.now },
    history: [{
        question: String,
        answer: String,
        score: Number,
        evaluation: String,
        improvement: String
    }]
});

const InterviewSession = mongoose.model('InterviewSession', interviewSchema);

// --- 3. AI AGENTS (MOCK MULTI-AGENT SYSTEM) [cite: 16, 28, 41] ---

const QuestionGeneratorAgent = {
    generate: (company, resumeName) => {
        const questions = [
            `How do your skills in ${resumeName} make you a good fit for ${company}?`,
            `Tell me about a technical challenge you solved, as mentioned in your resume.`,
            `What draws you to the culture and mission of ${company}?`,
            `Describe a time you had to learn a new tool quickly for a project.`
        ];
        return questions[Math.floor(Math.random() * questions.length)];
    }
};

const EvaluationAgent = {
    evaluate: (answer) => {
        const score = answer.length > 50 ? Math.floor(Math.random() * 20) + 75 : 50;
        return { 
            score, 
            feedback: score > 70 ? "Detailed and clear response." : "Try to add more technical details." 
        };
    }
};

const ImprovementAgent = {
    getTips: () => "Try using the STAR method (Situation, Task, Action, Result) for better structure."
};

// --- 4. WEBSOCKET LOGIC (DATA FLOW) [cite: 36, 43, 44] ---

wss.on('connection', (ws) => {
    console.log('New student connected to session');
    
    let userContext = {
        company: '',
        resumeName: '',
        currentQuestion: '',
        dbRecordId: null // To track the MongoDB document
    };

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'setup':
                    // Initialize context and create a new Database record [cite: 25, 42]
                    userContext.company = data.company || 'Unknown Company';
                    userContext.resumeName = data.resumeName || 'Unknown Resume';

                    try {
                        const newSession = new InterviewSession({
                            company: userContext.company,
                            resumeName: userContext.resumeName
                        });
                        const savedSession = await newSession.save();
                        userContext.dbRecordId = savedSession._id;
                        console.log(`📝 Session record created: ${userContext.dbRecordId}`);
                    } catch (dbErr) {
                        console.error("⚠️ Failed to save session to MongoDB:", dbErr.message);
                        // Still allow interview to proceed without DB tracking
                    }

                    // Agent 1 generates initial question [cite: 28]
                    const initialQ = QuestionGeneratorAgent.generate(userContext.company, userContext.resumeName);
                    userContext.currentQuestion = initialQ;
                    
                    ws.send(JSON.stringify({ type: 'question', text: initialQ }));
                    break;

                case 'answer':
                    // Agent 2 & 3 evaluate the answer [cite: 26, 27, 28]
                    const evaluation = EvaluationAgent.evaluate(data.text);
                    const tips = ImprovementAgent.getTips();

                    // SAVE TO DATABASE if we have a record ID [cite: 42]
                    if (userContext.dbRecordId) {
                        try {
                            await InterviewSession.findByIdAndUpdate(userContext.dbRecordId, {
                                $push: { history: {
                                    question: userContext.currentQuestion,
                                    answer: data.text,
                                    score: evaluation.score,
                                    evaluation: evaluation.feedback,
                                    improvement: tips
                                }}
                            });
                        } catch (dbUpdateErr) {
                            console.error("⚠️ Failed to update session in MongoDB:", dbUpdateErr.message);
                        }
                    }

                    // Send feedback back to UI [cite: 30]
                    ws.send(JSON.stringify({
                        type: 'feedback',
                        score: evaluation.score,
                        evaluation: evaluation.feedback,
                        improvement: tips
                    }));

                    // Agent 1 generates next question after delay [cite: 43]
                    setTimeout(() => {
                        const nextQ = QuestionGeneratorAgent.generate(userContext.company, userContext.resumeName);
                        userContext.currentQuestion = nextQ;
                        ws.send(JSON.stringify({ type: 'question', text: nextQ }));
                    }, 2000);
                    break;
            }
        } catch (parseErr) {
            console.error("❌ Error processing WebSocket message:", parseErr.message);
        }
    });
});

server.listen(PORT, () => {
    console.log(`🚀 NextGen Server running on http://localhost:${PORT}`);
});