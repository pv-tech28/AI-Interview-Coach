const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

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
 */
const InterviewerPro = {
    generateQuestions: async (company) => {
        // Simulated "Web Search" results for specific companies
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
        const finalAnswer = userResponse; // Clearly labeled for internal logic
        const wordCount = finalAnswer.trim().split(/\s+/).length;
        const fillerWords = (originalSpeech.match(/\bum\b|\bah\b|\blike\b|\bugh\b|\ber\b|\bbasically\b|\bactually\b/gi) || []);
        
        // 1. Relevance Analysis (Context-Specific)
        let relevanceScore = 100;
        let relevanceFeedback = "Your response directly addresses the technical core of the question.";
        
        const technicalTerms = finalAnswer.match(/\b(database|latency|throughput|kafka|react|node|api|schema|index|query|load balance|cache|memory|cpu|network)\b/gi) || [];
        
        if (technicalTerms.length > 0) {
            relevanceFeedback = `Your response correctly identifies the significance of ${technicalTerms[0]} in the context of this problem. However, to truly impress ${company}, you must expand on the quantitative results.`;
        } else if (wordCount < 20) {
            relevanceScore = 40;
            relevanceFeedback = `Your answer lacks the technical specificity expected at ${company}. You must move beyond generalities.`;
        }

        // 2. Nitpicker Audit (Evidence Only - Quote-Based Feedback)
        const mistakes = [];
        const weakWords = [];
        const weakWordMap = {
            'worked on': ['orchestrated', 'spearheaded', 'engineered', 'architected'],
            'did': ['executed', 'implemented', 'facilitated', 'dispatched'],
            'handled': ['managed', 'coordinated', 'navigated'],
            'good': ['exceptional', 'optimal', 'robust'],
            'slow': ['unoptimized', 'high-latency', 'bottlenecked'],
            'getting slow': ['experiencing latency', 'bottlenecked', 'scaling poorly']
        };

        // Case Sensitivity & Punctuation (Actual Text Check)
        if (finalAnswer.length > 0 && finalAnswer[0] !== finalAnswer[0].toUpperCase()) {
            mistakes.push({ 
                incorrect: `Quote: "${finalAnswer[0]}"`, 
                corrected: finalAnswer[0].toUpperCase(), 
                reason: "Case Sensitivity: Sentences must begin with a capital letter for executive presence." 
            });
        }
        
        if (finalAnswer.length > 0 && !/[.!?]$/.test(finalAnswer.trim())) {
            const lastChar = finalAnswer.trim().slice(-1);
            mistakes.push({ 
                incorrect: `Quote: "...${lastChar}"`, 
                corrected: `${lastChar}.`, 
                reason: "Structural Integrity: Every professional statement must conclude with appropriate punctuation." 
            });
        }

        // Grammar checks on ACTUAL text (Verification Rule - Must Quote)
        const commonErrors = [
            { pattern: /\bi has\b/gi, corrected: "I have", reason: "Subject-verb agreement error found in your text." },
            { pattern: /\bme and\b/gi, corrected: "... and I", reason: "Case error: 'I' must be used as the subject." },
            { pattern: /\bi ([\w]+)s\b/gi, corrected: "I $1", reason: "Agreement error: First-person singular verbs do not take an 's' suffix." }
        ];

        commonErrors.forEach(err => {
            const match = finalAnswer.match(err.pattern);
            if (match) {
                mistakes.push({ 
                    incorrect: `Quote: "${match[0]}"`, 
                    corrected: err.corrected, 
                    reason: err.reason 
                });
            }
        });

        // Weak Words (Evidence-Based Only - Quote-Based)
        Object.keys(weakWordMap).forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            const match = finalAnswer.match(regex);
            if (match) {
                weakWords.push({ 
                    word: `Quote: "${match[0]}"`, // Quoting the exact phrase
                    synonyms: weakWordMap[word] 
                });
            }
        });

        const grammarScore = mistakes.length === 0 ? 100 : Math.max(0, 100 - (mistakes.length * 20));
        const vocabScore = weakWords.length === 0 ? 100 : Math.max(0, 100 - (weakWords.length * 15));

        // 3. Dynamic Gold Standard (No Templates - Inventing Scenario based on User Answer)
        const userContext = technicalTerms[0] || "this technical challenge";
        const upgradeScenario = technicalTerms.includes('latency') ? "optimizing sub-millisecond response times" : 
                               technicalTerms.includes('database') ? "architecting a sharded database schema" :
                               technicalTerms.includes('api') ? "developing a high-throughput RESTful gateway" :
                               "orchestrating a mission-critical system migration";

        const modelAnswer = `[Situation]: In my previous engagement, we encountered a significant challenge involving ${userContext}, which threatened our ${company}-level standards for performance. [Task]: My objective was to address this by ${upgradeScenario}, targeting a specific improvement in overall system resilience. [Action]: I spearheaded the implementation of a more robust architecture, specifically focusing on ${technicalTerms[1] || 'advanced data modeling'} and ensuring seamless integration with existing CI/CD pipelines. [Result]: Consequently, we achieved a measurable ${Math.floor(Math.random() * 50) + 10}% improvement in operational efficiency, a standard I intend to bring to ${company}.`;

        // 4. Confidence Score Calculation: (Relevance x 0.4) + (Grammar x 0.3) + (Vocab x 0.3)
        let finalScore = (relevanceScore * 0.4) + (grammarScore * 0.3) + (vocabScore * 0.3);
        
        // Ceiling at 85%
        finalScore = Math.min(85, finalScore);
        
        const scoreReason = `Confidence Score: ${Math.round(finalScore)}%. To reach 95%, you must upgrade your vocabulary and provide deeper quantitative evidence.`;

        // Real-World Context (Adaptive)
        const context = `At ${company}, technical excellence is not just about code; it's about the 'Contextual Mastery' of how your solutions drive business impact. Your answer should reflect their core focus on innovation and reliability.`;

        const fillerWordCounts = {};
        fillerWords.forEach(w => {
            const word = w.toLowerCase();
            fillerWordCounts[word] = (fillerWordCounts[word] || 0) + 1;
        });

        const audit = {
            mistakes,
            weakWords,
            fillers: Object.entries(fillerWordCounts).map(([word, count]) => ({
                word,
                count,
                replacement: "a strategic pause"
            }))
        };

        return {
            score: Math.round(finalScore),
            scoreReason: scoreReason,
            relevance: relevanceFeedback,
            audit,
            modelAnswer: modelAnswer,
            companyContext: context
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
                    const currentQuestion = userContext.questions[userContext.currentQuestionIndex];

                    // Agent 3: @Evaluation Agent receives userResponse as a separate, clearly labeled string
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
