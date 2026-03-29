const setupSection = document.getElementById('setup-section');
const interviewSection = document.getElementById('interview-section');
const startBtn = document.getElementById('startBtn');
const companyInput = document.getElementById('companyInput');
const resumeInput = document.getElementById('resumeInput');
const dropZone = document.getElementById('drop-zone');
const fileNameDisplay = document.getElementById('file-name-display');
const chatBox = document.getElementById('chat-box');
const recordBtn = document.getElementById('recordBtn');
const editBtn = document.getElementById('editBtn');
const submitBtn = document.getElementById('submitBtn');
const answerInput = document.getElementById('answerInput');
const transcriptPreview = document.getElementById('transcript-preview');
const inputInstruction = document.getElementById('input-instruction');
const scoreFill = document.getElementById('score-fill');
const scoreText = document.getElementById('score-text');
const feedbackContent = document.getElementById('feedback-content');

let socket;
let recognition;
let isRecording = false;
let selectedFile = null;
let originalSpeechText = '';
let currentQuestion = ''; // 🌟 NEW: Track current question
let lastUserAnswer = ''; // 🌟 NEW: Track last submitted answer
let feedbackHistory = JSON.parse(localStorage.getItem('feedbackHistory') || '[]'); // 🌟 NEW: Client-side history storage

/* ================= FILE UPLOAD ================= */

function handleFileSelect(file) {
    if (file && file.type === 'application/pdf') {
        selectedFile = file;
        fileNameDisplay.innerText = file.name;
    } else if (file) {
        alert('Upload PDF only');
    }
}

resumeInput.onchange = (e) => handleFileSelect(e.target.files[0]);

dropZone.ondrop = (e) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files[0]);
};

/* ================= WEBSOCKET ================= */

function initWebSocket() {
    socket = new WebSocket(`ws://${window.location.hostname}:3005`);

    socket.onopen = () => {
        socket.send(JSON.stringify({
            type: 'setup',
            company: companyInput.value,
            resumeName: selectedFile ? selectedFile.name : ''
        }));
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'question') {
            currentQuestion = data.text; // 🌟 CAPTURE QUESTION TEXT
            addMessage(data.text, 'bot');
        }
        if (data.type === 'feedback') {
            updateFeedbackUI(data);
            saveToHistory(data); // 🌟 NEW: SAVE TO HISTORY ON EACH FEEDBACK
        }
    };
}

/* ================= HISTORY ================= */

function saveToHistory(data) {
    const historyEntry = {
        id: Date.now(),
        question: currentQuestion,
        answer: lastUserAnswer,
        score: data.score,
        scoreReason: data.scoreReason,
        audit: data.audit || { mistakes: [], weakWords: [], fillers: [] },
        modelAnswer: data.modelAnswer || '',
        companyContext: data.companyContext || ''
    };

    feedbackHistory.unshift(historyEntry);
    localStorage.setItem('feedbackHistory', JSON.stringify(feedbackHistory));
    renderHistoryList(0); // Highlight the newest one
}

function renderHistoryList(activeIndex = -1) {
    const historyList = document.getElementById('history-list');
    if (!historyList) return;

    if (feedbackHistory.length === 0) {
        historyList.innerHTML = '<p class="placeholder">No previous answers yet</p>';
        return;
    }

    historyList.innerHTML = feedbackHistory.map((item, index) => `
        <div class="history-item ${index === activeIndex ? 'active' : ''}" onclick="selectHistoryItem(${index})">
            <div class="q-title">${item.question}</div>
            <div class="meta">
                <span class="score-pill">${item.score}%</span>
                <span class="timestamp">${new Date(item.id).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
        </div>
    `).join('');
}

function selectHistoryItem(index) {
    const item = feedbackHistory[index];
    if (!item) return;

    // Re-render feedback sidebar using historical data
    updateFeedbackUI(item);
    
    // Highlight active in sidebar
    renderHistoryList(index);
}

/* ================= UI ================= */

function addMessage(text, sender) {
    const msg = document.createElement('div');
    msg.className = `message ${sender}`;
    msg.innerText = text;
    chatBox.appendChild(msg);
}

function updateFeedbackUI(data) {
    // 1. Update Score
    scoreFill.style.width = `${data.score}%`;
    scoreText.innerText = `${data.score}%`;

    // 2. Build 4-Step Feedback UI
    let feedbackHtml = '';

    // STEP 1: Nitpicker Audit (Mistakes & Fillers)
    const mistakes = data.audit?.mistakes || [];
    const fillers = data.audit?.fillers || [];
    feedbackHtml += `
        <div class="feedback-item audit-feedback">
            <h4><i class="fas fa-microscope"></i> Step 1: Nitpicker Audit</h4>
            <div class="audit-section">
                ${mistakes.length > 0 ? mistakes.map(m => `
                    <div class="grammar-pair">
                        <p class="incorrect"><span>Quote:</span> "${m.incorrect}"</p>
                        <p class="corrected"><span>Fixed:</span> "${m.corrected}"</p>
                        <p class="reason">${m.reason}</p>
                    </div>
                `).join('') : '<p class="success-text">No major grammatical or technical errors detected.</p>'}
                
                ${fillers.length > 0 ? `
                    <div class="filler-info-container">
                        <h5 style="font-size: 0.8rem; margin-top: 1rem; color: #8b949e;">FILLER WORD USAGE</h5>
                        ${fillers.map(f => `
                            <p class="filler-info">Found "${f.word}" (${f.count}x). Try replacing with: <strong>${f.replacement}</strong></p>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        </div>
    `;

    // STEP 2: Vocabulary Upgrade (Weak Words)
    const weakWords = data.audit?.weakWords || [];
    feedbackHtml += `
        <div class="feedback-item relevance-feedback">
            <h4><i class="fas fa-arrow-up"></i> Step 2: Vocabulary Upgrade</h4>
            <div class="audit-section">
                ${weakWords.length > 0 ? weakWords.map(w => `
                    <div class="weak-word-item">
                        <p class="weak-word">Avoid: "${w.word}"</p>
                        <p class="synonyms">Elite alternatives: ${w.synonyms.map(s => `<em>${s}</em>`).join(', ')}</p>
                    </div>
                `).join('') : '<p class="success-text">Excellent vocabulary choice.</p>'}
            </div>
        </div>
    `;

    // STEP 3: Gold Standard (STAR Method)
    feedbackHtml += `
        <div class="feedback-item model-feedback">
            <h4><i class="fas fa-star"></i> Step 3: Gold Standard (STAR)</h4>
            <div class="model-answer-box">
                <p class="model-text">${data.modelAnswer || 'A model answer is being generated based on your input.'}</p>
            </div>
        </div>
    `;

    // STEP 4: Company DNA (Company Context)
    feedbackHtml += `
        <div class="feedback-item context-feedback">
            <h4><i class="fas fa-building"></i> Step 4: Company DNA</h4>
            <p class="context-text">${data.companyContext || `Insights for your target company are being retrieved.`}</p>
        </div>
    `;

    feedbackContent.innerHTML = feedbackHtml;
}

/* ================= START ================= */

startBtn.onclick = () => {
    setupSection.classList.add('hidden');
    interviewSection.classList.remove('hidden');
    initWebSocket();
    renderHistoryList(); // 🌟 LOAD HISTORY ON START
};

/* ================= 🎤 VOICE FIX ================= */

/* ================= 🎤 VOICE FIX (Merged & Optimized) ================= */

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true; // Crucial for "Real-time" feel
    recognition.lang = 'en-US';

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

        // 🌟 FIX: Put speech directly into the Textarea so it's editable
        const currentText = finalTranscript || interimTranscript;
        if (currentText) {
            originalSpeechText = currentText; // 🌟 CAPTURE RAW SPEECH FOR FILLER CHECK
            answerInput.value = currentText;
            answerInput.readOnly = false; // 🔓 Allow user to click and edit
            
            // Show buttons
            submitBtn.classList.remove('hidden');
            inputInstruction.innerText = "Speech captured! You can now edit or submit.";
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        stopRecording();
    };

} else {
    alert("Speech recognition is not supported in this browser. Please use Chrome.");
}

/* ================= RECORDING FLOW ================= */

function startRecording(e) {
    if (e) e.preventDefault();
    if (!recognition || isRecording) return;

    isRecording = true;
    answerInput.value = '';
    answerInput.placeholder = "Listening...";
    
    recordBtn.classList.add('recording');
    const span = recordBtn.querySelector('span');
    if (span) span.innerText = 'Recording...';

    try {
        recognition.start();
    } catch (err) {
        console.error("Start recording failed:", err);
        stopRecording();
    }
}

function stopRecording(e) {
    if (e) e.preventDefault();
    if (!isRecording) return;

    isRecording = false;
    recordBtn.classList.remove('recording');
    const span = recordBtn.querySelector('span');
    if (span) span.innerText = 'Hold to Speak';

    try {
        recognition.stop();
        answerInput.placeholder = "Edit your answer here...";
    } catch (err) {
        console.error("Stop recording failed:", err);
    }
}

// Standard Events (Mouse & Touch)
recordBtn.onmousedown = startRecording;
recordBtn.onmouseup = stopRecording;
recordBtn.onmouseleave = stopRecording; // Safety if mouse leaves button

recordBtn.ontouchstart = (e) => { e.preventDefault(); startRecording(e); };
recordBtn.ontouchend = (e) => { e.preventDefault(); stopRecording(e); };

/* ================= SUBMIT ================= */

submitBtn.onclick = () => {
    const text = answerInput.value;
    lastUserAnswer = text; // 🌟 CAPTURE ANSWER FOR HISTORY

    addMessage(text, 'user');

    socket.send(JSON.stringify({
        type: 'answer',
        originalText: originalSpeechText,
        editedText: text
    }));

    answerInput.value = '';
    editBtn.classList.add('hidden');
    submitBtn.classList.add('hidden');
};