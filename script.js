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
        if (data.type === 'question') addMessage(data.text, 'bot');
        if (data.type === 'feedback') updateFeedbackUI(data);
    };
}

/* ================= UI ================= */

function addMessage(text, sender) {
    const msg = document.createElement('div');
    msg.className = `message ${sender}`;
    msg.innerText = text;
    chatBox.appendChild(msg);
}

function updateFeedbackUI(data) {
    scoreFill.style.width = `${data.score}%`;
    scoreText.innerText = `${data.score}%`;
}

/* ================= START ================= */

startBtn.onclick = () => {
    setupSection.classList.add('hidden');
    interviewSection.classList.remove('hidden');
    initWebSocket();
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
        // We use || to show whatever is available (Final or Interim)
        const currentText = finalTranscript || interimTranscript;
        if (currentText) {
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

/* ================= SUBMIT ANSWER ================= */

submitBtn.onclick = () => {
    const text = answerInput.value.trim();
    if (!text) return;

    // Send final text to the @interviewer-pro agent
    addMessage(text, 'user');

    socket.send(JSON.stringify({
        type: 'answer',
        originalText: originalSpeechText || text,
        editedText: text
    }));

    // Reset UI
    answerInput.value = '';
    originalSpeechText = '';
    answerInput.readOnly = true;
    submitBtn.classList.add('hidden');
    inputInstruction.innerText = "Hold to Speak to provide your answer.";
};