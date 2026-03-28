const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Serve static files from the root directory
app.use(express.static(path.join(__dirname)));

// --- Database Integration (Placeholder) ---
/*
const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/interview_coach', { useNewUrlParser: true, useUnifiedTopology: true });
// or Firebase integration
const admin = require('firebase-admin');
admin.initializeApp({ ... });
*/

// --- AI Agents (Mock Multi-Agent System) ---

/**
 * Agent 1: Question Generator
 * Generates interview questions based on company and resume.
 */
const QuestionGeneratorAgent = {
    generate: (company, resumeName) => {
        const questions = [
            `Tell me about a challenging project you've worked on that would be relevant to ${company}.`,
            `How do your skills listed in ${resumeName} align with the core values of ${company}?`,
            `What is your most significant technical achievement mentioned in your resume?`,
            `Why do you want to work at ${company} specifically?`,
            `Describe a time you had to learn a new technology quickly for a project.`
        ];
        return questions[Math.floor(Math.random() * questions.length)];
    }
};

/**
 * Agent 2: Evaluation Agent
 * Evaluates the answer for content, grammar, and provides a score.
 */
const EvaluationAgent = {
    evaluate: (answer) => {
        const length = answer.length;
        let score = 50; // Base score
        let feedback = "";

        if (length > 100) {
            score += 30;
            feedback = "Excellent depth in your response. Grammar is solid.";
        } else if (length > 50) {
            score += 15;
            feedback = "Good answer, but could be more detailed. Minor grammatical improvements possible.";
        } else {
            score -= 10;
            feedback = "The answer is a bit too short. Try to elaborate more on your experiences.";
        }

        return { score, feedback };
    }
};

/**
 * Agent 3: Improvement Agent
 * Provides tips on confidence and communication style.
 */
const ImprovementAgent = {
    getTips: (answer) => {
        const tips = [
            "Try to use the STAR method (Situation, Task, Action, Result) for better structure.",
            "Maintain a steady pace; you're doing great with your vocal clarity!",
            "Consider adding more metrics or specific outcomes to your examples.",
            "Your confidence sounds good, keep that energy throughout the interview.",
            "Try to avoid filler words like 'um' or 'ah' to sound more professional."
        ];
        return tips[Math.floor(Math.random() * tips.length)];
    }
};

// --- WebSocket Logic ---

wss.on('connection', (ws) => {
    console.log('New client connected');
    let userContext = {
        company: '',
        resumeName: '',
        currentQuestion: ''
    };

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'setup':
                userContext.company = data.company;
                userContext.resumeName = data.resumeName;
                
                // Agent 1 kicks off the interview
                const initialQuestion = QuestionGeneratorAgent.generate(userContext.company, userContext.resumeName);
                userContext.currentQuestion = initialQuestion;
                
                ws.send(JSON.stringify({
                    type: 'question',
                    text: initialQuestion
                }));
                break;

            case 'answer':
                // Agent 2 evaluates
                const evaluation = EvaluationAgent.evaluate(data.text);
                
                // Agent 3 provides tips
                const tips = ImprovementAgent.getTips(data.text);

                // Send feedback back to client
                ws.send(JSON.stringify({
                    type: 'feedback',
                    score: evaluation.score,
                    evaluation: evaluation.feedback,
                    improvement: tips
                }));

                // Agent 1 generates next question after a short delay
                setTimeout(() => {
                    const nextQuestion = QuestionGeneratorAgent.generate(userContext.company, userContext.resumeName);
                    userContext.currentQuestion = nextQuestion;
                    ws.send(JSON.stringify({
                        type: 'question',
                        text: `Follow-up: ${nextQuestion}`
                    }));
                }, 2000);
                break;
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
