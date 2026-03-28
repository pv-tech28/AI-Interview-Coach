// DOM Elements
const setupSection = document.getElementById('setup-section');
const interviewSection = document.getElementById('interview-section');
const startBtn = document.getElementById('startBtn');
const companyInput = document.getElementById('companyInput');
const resumeInput = document.getElementById('resumeInput');
const chatBox = document.getElementById('chat-box');
const recordBtn = document.getElementById('recordBtn');
const sendBtn = document.getElementById('sendBtn');
const transcriptArea = document.getElementById('transcript-area');
const scoreFill = document.getElementById('score-fill');
const scoreText = document.getElementById('score-text');
const feedbackContent = document.getElementById('feedback-content');

let socket;
let recognition;
let isRecording = false;

// Initialize WebSocket
function initWebSocket() {
    socket = new WebSocket(`ws://${window.location.hostname}:3000`);

    socket.onopen = () => {
        console.log('Connected to server');
        // Send initial setup data
        const setupData = {
            type: 'setup',
            company: companyInput.value || 'General',
            resumeName: resumeInput.files[0] ? resumeInput.files[0].name : 'No resume uploaded'
        };
        socket.send(JSON.stringify(setupData));
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
    };

    socket.onclose = () => {
        console.log('Disconnected from server');
        addMessage('Connection lost. Please refresh the page.', 'bot');
    };
}

// Handle messages from server
function handleServerMessage(data) {
    switch (data.type) {
        case 'question':
            addMessage(data.text, 'bot');
            break;
        case 'feedback':
            updateFeedbackUI(data);
            break;
        case 'info':
            console.log('Server Info:', data.text);
            break;
    }
}

// UI Functions
function addMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    msgDiv.innerText = text;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function updateFeedbackUI(data) {
    // Update Score
    if (data.score !== undefined) {
        scoreFill.style.width = `${data.score}%`;
        scoreText.innerText = `${data.score}%`;
    }

    // Update Feedback List
    feedbackContent.innerHTML = ''; // Clear placeholder
    
    const feedbackItems = [
        { title: 'Grammar & Evaluation', content: data.evaluation },
        { title: 'Confidence & Communication', content: data.improvement }
    ];

    feedbackItems.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'feedback-item';
        itemDiv.innerHTML = `
            <h4>${item.title}</h4>
            <p>${item.content}</p>
        `;
        feedbackContent.appendChild(itemDiv);
    });
}

// Start Interview
startBtn.onclick = () => {
    if (!companyInput.value) {
        alert('Please enter a target company name.');
        return;
    }
    
    setupSection.classList.add('hidden');
    interviewSection.classList.remove('hidden');
    initWebSocket();
};

// Voice Recognition Setup
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        transcriptArea.innerText = finalTranscript || interimTranscript;
        transcriptArea.classList.remove('hidden');
        
        if (finalTranscript) {
            sendBtn.classList.remove('hidden');
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        stopRecording();
    };
}

function startRecording() {
    isRecording = true;
    recordBtn.classList.add('recording');
    recordBtn.querySelector('span').innerText = 'Recording...';
    transcriptArea.innerText = 'Listening...';
    transcriptArea.classList.remove('hidden');
    recognition.start();
}

function stopRecording() {
    isRecording = false;
    recordBtn.classList.remove('recording');
    recordBtn.querySelector('span').innerText = 'Hold to Speak';
    recognition.stop();
}

// Record Button Events
recordBtn.onmousedown = startRecording;
recordBtn.onmouseup = stopRecording;
recordBtn.ontouchstart = (e) => { e.preventDefault(); startRecording(); };
recordBtn.ontouchend = (e) => { e.preventDefault(); stopRecording(); };

// Send Answer
sendBtn.onclick = () => {
    const text = transcriptArea.innerText;
    if (text && text !== 'Listening...') {
        addMessage(text, 'user');
        socket.send(JSON.stringify({
            type: 'answer',
            text: text
        }));
        
        // Reset UI
        transcriptArea.innerText = '';
        transcriptArea.classList.add('hidden');
        sendBtn.classList.add('hidden');
    }
};
