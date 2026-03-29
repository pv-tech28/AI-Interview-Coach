const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --- GEMINI INITIALIZATION ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Multer setup for file uploads
const upload = multer({ dest: 'uploads/' });

const PORT = process.env.PORT || 3005;

// Serve static files (HTML, CSS, JS) from the root directory
app.use(express.static(__dirname));
app.use(express.json());

// --- ROUTES ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'signup.html'));
});

app.get('/interview', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- AUTH ROUTES ---
const JWT_SECRET = 'your-very-secret-key-123'; // In production, use process.env.JWT_SECRET

app.post('/api/auth/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        // Check if user exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ error: "User already exists" });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const newUser = new User({
            name,
            email,
            password: hashedPassword
        });

        await newUser.save();

        // Create token
        const token = jwt.sign({ userId: newUser._id }, JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({ 
            message: "User created successfully", 
            token,
            user: { name: newUser.name, email: newUser.email }
        });
    } catch (err) {
        console.error("Signup error:", err);
        res.status(500).json({ error: "Error during signup" });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        // Create token
        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

        res.json({ 
            message: "Login successful", 
            token,
            user: { name: user.name, email: user.email }
        });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ error: "Error during login" });
    }
});

// --- 1. MONGODB CONNECTION ---
const connectDB = async () => {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/interview_coach');
        console.log("✅ MongoDB Connected: NextGen Database Active");
    } catch (err) {
        console.error("❌ MongoDB Connection Error (Ensure MongoDB is running!):", err.message);
    }
};
connectDB();

// --- 2. DATABASE SCHEMA ---
const interviewSchema = new mongoose.Schema({
    company: String,
    resumeName: String,
    skills: {
        programmingLanguages: [String],
        frameworksLibraries: [String],
        databases: [String],
        toolsTechnologies: [String]
    }, // Grouped technical skills extracted from resume
    date: { type: Date, default: Date.now },
    history: [{
        question: String,
        originalAnswer: String,
        finalAnswer: String,
        score: Number,
        evaluation: String,
        improvement: String
    }]
});

const InterviewSession = mongoose.model('InterviewSession', interviewSchema);

// --- 2.1 USER SCHEMA ---
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});

const User = mongoose.model('User', userSchema);

// --- 3. AI AGENTS (MULTI-AGENT SYSTEM) ---

/**
 * Agent 1: @Resume Skill Mapper
 * Extracts ONLY technical skills explicitly mentioned in the resume.
 * Groups them into: Programming Languages, Frameworks/Libraries, Databases, Tools/Technologies.
 */
const ResumeSkillMapper = {
    extractSkills: async (resumeName) => {
        // In a production environment, this would parse the actual PDF content.
        // Here we simulate strict extraction based on common technical terms.
        
        const technicalLibrary = {
            programmingLanguages: ['JavaScript', 'Python', 'Java', 'C++', 'TypeScript', 'Ruby', 'Go', 'Rust', 'PHP'],
            frameworksLibraries: ['React', 'Node.js', 'Express', 'Angular', 'Vue', 'Django', 'Flask', 'Spring Boot', 'Tailwind CSS', 'Redux'],
            databases: ['MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Cassandra', 'DynamoDB', 'SQLite'],
            toolsTechnologies: ['Docker', 'Kubernetes', 'AWS', 'Azure', 'Git', 'Jenkins', 'Terraform', 'GraphQL', 'Nginx']
        };

        const extractedSkills = {
            programmingLanguages: [],
            frameworksLibraries: [],
            databases: [],
            toolsTechnologies: []
        };

        // Simulate extraction logic: Only pick terms that "appear" in the resume metadata or simulated content
        // For demonstration, we'll "find" skills based on the resume name or common defaults if it's a generic upload
        const simulatedContent = resumeName.toLowerCase();

        Object.keys(technicalLibrary).forEach(category => {
            technicalLibrary[category].forEach(skill => {
                if (simulatedContent.includes(skill.toLowerCase())) {
                    extractedSkills[category].push(skill);
                }
            });
        });

        // Fallback: If resume name is generic, provide a structured but strictly technical set for the demo
        if (Object.values(extractedSkills).every(arr => arr.length === 0)) {
            extractedSkills.programmingLanguages = ['JavaScript', 'TypeScript'];
            extractedSkills.frameworksLibraries = ['React', 'Node.js'];
            extractedSkills.databases = ['MongoDB'];
            extractedSkills.toolsTechnologies = ['Git', 'Docker'];
        }

        console.log(`@Resume Skill Mapper: Extracted grouped skills from "${resumeName}"`);
        return extractedSkills;
    }
};

/**
 * Agent 2: @Interviewer Pro
 * Generates initial and follow-up interview questions based on company-specific values and user skills.
 * UPDATED: Now uses Gemini to generate 3 unique questions based on real-time company trends.
 */
const InterviewerPro = {
    generateQuestions: async (company) => {
        try {
            const prompt = `
                You are an Elite Technical Interviewer for ${company}.
                Search for the top 3 current (2024-2025) interview trends, core values, or engineering standards for ${company}.
                Based on these, generate 3 unique, high-level technical/behavioral interview questions.
                
                RULES:
                1. DO NOT use generic questions. 
                2. If the company is MindTree, focus on their specific engineering standards.
                3. If it's Google, focus on Googliness and GCA.
                4. Tailor every word to ${company}.
                
                Return ONLY a JSON array of 3 strings.
            `;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            throw new Error('Fallback to static questions');

        } catch (error) {
            console.warn("⚠️ InterviewerPro Gemini Error, using fallback:", error.message);
            const companyDNA = {
                "Google": ["Googliness (intellectual humility)", "General Cognitive Ability (structured problem solving)", "Leadership through influence"],
                "Amazon": ["Customer Obsession", "Ownership & Bias for Action", "Deliver Results"],
                "MindTree": ["Engineering Standards & Reliability", "Collaborative Mindset", "Digital Transformation Mastery"],
                "Meta": ["Move Fast & Focus on Impact", "Build for Billions", "Live in the Future"],
                "Microsoft": ["Growth Mindset", "Empowering Others", "Technical Excellence with Diverse Teams"]
            };
            const values = companyDNA[company] || ["Technical Excellence", "Innovative Problem Solving", "Strategic Impact"];
            return [
                `At ${company}, we prioritize ${values[0]}. Can you describe a complex technical challenge you've overcome that specifically demonstrates this?`,
                `Explain the architecture of a scalable system you've built, focusing on how it satisfies ${company}'s focus on ${values[1]}.`,
                `How does your technical trajectory align with ${company}'s commitment to ${values[2]}?`
            ];
        }
    },

    generateInitialQuestion: async (company, skills) => {
        try {
            const tech = skills.programmingLanguages[0] || 'software engineering';
            const prompt = `
                You are an Elite Technical Interviewer for ${company}.
                The candidate has skills in ${tech}.
                Generate 1 unique, professional opening interview question that combines ${company}'s core values with the candidate's expertise in ${tech}.
                
                Return ONLY the question string.
            `;
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text().trim();
        } catch (error) {
            const tech = skills.programmingLanguages[0] || 'software engineering';
            return `Welcome. To start our ${company} technical assessment, can you walk me through a project where you utilized ${tech} to solve a high-impact problem?`;
        }
    }
};

/**
 * Agent 3: @Evaluation Agent (Adaptive Elite Interviewer)
 * SYSTEM PROMPT:
 * - You will receive a clearly labeled 'userResponse' string.
 * - You must provide 'Quote-based feedback' for all mistakes.
 * - For every grammatical or structural flaw, you MUST provide the exact quote from the 'userResponse'.
 * - Hallucinations are strictly forbidden: if the mistake is not present in the 'userResponse', do not list it.
 */
const EvaluationAgent = {
    evaluate: async ({ userResponse, originalSpeech, company, question }) => {
        try {
            // Check if API key is provided
            if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_api_key_here') {
                throw new Error('GEMINI_API_KEY is not configured');
            }

            const prompt = `
                You are a strict but helpful AI Interview Coach for ${company}.
                Your job is to evaluate the user's answer with professional honesty.
                
                Question: "${question}"
                User's Original Speech (raw): "${originalSpeech}"
                User's Edited Answer (primary): "${userResponse}"
                
                RULES:
                1. CONFIDENCE SCORE: Start with a LOW or moderate score (40%–65%) even for good answers. Increase ONLY if the answer is truly exceptional.
                2. FEEDBACK STYLE: Be realistic, slightly critical, and constructive. Avoid over-praising (no "Excellent", "Perfect").
                3. VOCABULARY UPGRADE: ALWAYS suggest 2–3 stronger or more professional alternatives for their word choices.
                4. NITPICKER AUDIT: Identify small mistakes like grammar, repetition, or weak phrasing.
                5. STAR IMPROVEMENT: Rewrite the answer using the STAR format (Situation, Task, Action, Result) to be a direct upgrade of their context.
                6. TONE: Honest, professional interviewer (not a supportive friend).
                
                Provide structured feedback in EXACTLY this JSON format:
                {
                    "score": number (40-65 for good, higher only if exceptional),
                    "scoreReason": "string (Professional, slightly critical explanation)",
                    "relevance": "string (Constructive analysis of technical depth)",
                    "audit": {
                        "mistakes": [
                            {
                                "incorrect": "string (quote from userResponse)",
                                "corrected": "string (fixed version)",
                                "reason": "string (why it was weak/wrong)"
                            }
                        ],
                        "weakWords": [
                            {
                                "word": "string (quote from userResponse)",
                                "synonyms": ["string", "string", "string"]
                            }
                        ],
                        "fillers": [
                            {
                                "word": "string",
                                "count": number,
                                "replacement": "string"
                            }
                        ]
                    },
                    "modelAnswer": "string (Upgraded STAR format answer)",
                    "companyContext": "string (Briefly link to ${company} standards)"
                }
                
                RULES FOR JSON:
                - Output ONLY valid JSON.
                - Use 'Quote-based feedback' for mistakes.
            `;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            
            // Extract JSON if Gemini wraps it in markdown code blocks
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('Invalid Gemini response format');
            
            let data = JSON.parse(jsonMatch[0]);
            
            // Ensure the score starts in the requested range if not already strictly handled by AI
            if (data.score > 85) data.score = 85; 
            
            return data;

        } catch (error) {
            console.error("❌ Gemini Evaluation Error:", error.message);
            
            // Fallback to local logic if Gemini fails
            return EvaluationAgent.fallbackEvaluate(userResponse, originalSpeech, company, question);
        }
    },

    fallbackEvaluate: (userResponse, originalSpeech, company, question) => {
        const finalAnswer = userResponse;
        const wordCount = finalAnswer.trim().split(/\s+/).length;
        
        let relevanceScore = 50; // Starting strict
        let relevanceFeedback = "Your response addresses the question but needs more technical depth and professional structure.";
        
        const technicalTerms = finalAnswer.match(/\b(database|latency|throughput|kafka|react|node|api|schema|index|query|load balance|cache|memory|cpu|network)\b/gi) || [];
        
        if (technicalTerms.length > 3) {
            relevanceScore = 65;
            relevanceFeedback = `You've identified key technical concepts like ${technicalTerms.slice(0, 2).join(', ')}, but the articulation remains slightly informal.`;
        } else if (wordCount < 20) {
            relevanceScore = 40;
            relevanceFeedback = `Your answer is too brief for an elite candidate at ${company}. Expand on your specific technical contributions.`;
        }

        const mistakes = [];
        const weakWords = [];
        const weakWordMap = {
            'worked on': ['orchestrated', 'spearheaded', 'engineered'],
            'did': ['executed', 'implemented', 'facilitated'],
            'handled': ['managed', 'coordinated', 'navigated'],
            'good': ['exceptional', 'optimal', 'robust'],
            'slow': ['unoptimized', 'high-latency', 'bottlenecked'],
            'getting slow': ['experiencing latency', 'bottlenecked'],
            'trying to': ['striving to', 'aiming to', 'endeavoring to']
        };

        if (finalAnswer.length > 0 && finalAnswer[0] !== finalAnswer[0].toUpperCase()) {
            mistakes.push({ incorrect: `Quote: "${finalAnswer[0]}"`, corrected: finalAnswer[0].toUpperCase(), reason: "Informal casing. Start with capital letters." });
        }
        
        const commonErrors = [
            { pattern: /\bi has\b/gi, corrected: "I have", reason: "Subject-verb agreement." },
            { pattern: /\bme and\b/gi, corrected: "... and I", reason: "Grammatical case error." }
        ];

        commonErrors.forEach(err => {
            const match = finalAnswer.match(err.pattern);
            if (match) mistakes.push({ incorrect: `Quote: "${match[0]}"`, corrected: err.corrected, reason: err.reason });
        });

        Object.keys(weakWordMap).forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            const match = finalAnswer.match(regex);
            if (match) weakWords.push({ word: `Quote: "${match[0]}"`, synonyms: weakWordMap[word] });
        });

        // Strict scoring calculation
        let finalScore = relevanceScore;
        if (mistakes.length > 0) finalScore -= 5;
        if (weakWords.length < 2) finalScore -= 5; // Penalty for lack of professional vocabulary
        
        finalScore = Math.max(40, Math.min(65, finalScore)); // Clamping between 40-65 for fallback

        return {
            score: Math.round(finalScore),
            scoreReason: `Confidence Score: ${Math.round(finalScore)}%. Your response lacks the high-level professional vocabulary expected for this role. (Strict Fallback Active).`,
            relevance: relevanceFeedback,
            audit: {
                mistakes,
                weakWords,
                fillers: []
            },
            modelAnswer: `[Situation]: In a high-stakes environment at my previous firm... [Task]: I was tasked with optimizing the core infrastructure... [Action]: I spearheaded the implementation of... [Result]: This led to a measurable improvement in system reliability.`,
            companyContext: `At ${company}, candidates are expected to demonstrate technical precision and professional maturity.`
        };
    }
};

const ImprovementAgent = {
    // This agent now supports the EvaluationAgent with extra context if needed
    getTips: (answer, originalSpeech) => [] 
};

// --- 4. API ROUTES ---

// Route for manual resume analysis
app.post('/api/interview/analyze', upload.single('resume'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No resume file uploaded' });
        }

        const company = req.body.company || 'Unknown Company';
        const skills = await ResumeSkillMapper.extractSkills(req.file.originalname);
        const firstQuestion = await InterviewerPro.generateInitialQuestion(company, skills);

        const newSession = new InterviewSession({
            company,
            resumeName: req.file.originalname,
            skills,
            history: []
        });
        const savedSession = await newSession.save();

        res.json({
            sessionId: savedSession._id,
            firstQuestion,
            skills: skills // Now returning the grouped JSON structure
        });
    } catch (error) {
        console.error('Error in /api/interview/analyze:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- 5. WEBSOCKET LOGIC (DATA FLOW) ---

wss.on('connection', (ws) => {
    console.log('New student connected to session');
    
    let userContext = {
        company: '',
        resumeName: '',
        skills: {},
        questions: [],
        currentQuestionIndex: 0,
        dbRecordId: null,
        isAwaitingCompany: true
    };

    // Start by asking for the company
    ws.send(JSON.stringify({ 
        type: 'question', 
        text: "Welcome to the Elite Career Coach & Technical Interviewer session. To begin, which company are you preparing for today?" 
    }));

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (userContext.isAwaitingCompany && data.type === 'answer') {
                userContext.company = data.editedText || data.originalText;
                userContext.isAwaitingCompany = false;

                // Adaptive Initialization: Generate company-specific questions
                userContext.questions = await InterviewerPro.generateQuestions(userContext.company);

                ws.send(JSON.stringify({ 
                    type: 'info', 
                    text: `Excellent. I have analyzed current trends for ${userContext.company} and prepared 3 tailored questions for you. Let's begin.` 
                }));

                const firstQ = userContext.questions[0];
                ws.send(JSON.stringify({ type: 'question', text: firstQ }));
                return;
            }

            switch (data.type) {
                case 'setup':
                    userContext.resumeName = data.resumeName || 'Unknown Resume';
                    userContext.skills = await ResumeSkillMapper.extractSkills(userContext.resumeName);
                    break;

                case 'answer':
                    const originalText = data.originalText || '';
                    const editedText = data.editedText || originalText;
                    
                    // Safety check: ensure questions exist
                    if (!userContext.questions || userContext.questions.length === 0) {
                        userContext.questions = await InterviewerPro.generateQuestions(userContext.company || 'Technical Excellence');
                    }

                    const currentQuestion = userContext.questions[userContext.currentQuestionIndex] || "Tell me about your technical background.";

                    console.log(`Evaluating answer for: "${currentQuestion.substring(0, 30)}..."`);

                    const evaluationResult = await EvaluationAgent.evaluate({ 
                        userResponse: editedText, 
                        originalSpeech: originalText, 
                        company: userContext.company, 
                        question: currentQuestion 
                    });

                    ws.send(JSON.stringify({
                        type: 'feedback',
                        ...evaluationResult
                    }));

                    userContext.currentQuestionIndex++;

                    if (userContext.currentQuestionIndex < userContext.questions.length) {
                        setTimeout(() => {
                            const nextQ = userContext.questions[userContext.currentQuestionIndex];
                            ws.send(JSON.stringify({ type: 'question', text: nextQ }));
                        }, 3000);
                    } else {
                        setTimeout(() => {
                            ws.send(JSON.stringify({ 
                                type: 'question', 
                                text: "That concludes our Elite Coaching session. You have demonstrated significant potential. Review your feedback carefully to achieve peak performance." 
                            }));
                        }, 3000);
                    }
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
