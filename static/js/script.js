document.addEventListener('DOMContentLoaded', () => {
    // Step Containers
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3'); // config section
    const step4 = document.getElementById('step4'); // loader
    const step5 = document.getElementById('step5'); // results

    // Controls
    const fetchEmailsBtn = document.getElementById('fetchEmailsBtn');
    const emailList = document.getElementById('emailList');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const speakBtn = document.getElementById('speakBtn');

    // Inputs
    const usernameInput = document.getElementById('username');
    const loginAttemptsInput = document.getElementById('loginAttempts');
    const pagesAccessedInput = document.getElementById('pagesAccessed');
    const actionsInput = document.getElementById('actions');
    const timeOfDayInput = document.getElementById('timeOfDay');

    // Result Nodes
    const resUser = document.getElementById('resUser');
    const resIntent = document.getElementById('resIntent');
    const resRisk = document.getElementById('resRisk');
    const resConfidence = document.getElementById('resConfidence');
    const resExplanation = document.getElementById('resExplanation');
    const resSuggestion = document.getElementById('resSuggestion');
    const resultCard = document.getElementById('resultCard');

    let riskChart, intentChart, timelineChart;

    // Initialization
    initDashboard();

    // STEP 1 -> STEP 2: Fetch and Show Emails
    fetchEmailsBtn.addEventListener('click', async () => {
        fetchEmailsBtn.innerText = 'Synchronizing Intelligence...';
        fetchEmailsBtn.disabled = true;

        try {
            const response = await fetch('/fetch_emails');
            const emails = await response.json();
            
            if (emails.error) throw new Error(emails.error);

            renderEmails(emails);
            
            // Transition Step
            step1.classList.add('hidden');
            setTimeout(() => {
                step1.style.display = 'none';
                step2.classList.remove('hidden');
                step2.classList.add('visible');
            }, 600);

        } catch (error) {
            console.error('Fetch Error:', error);
            alert('Failed to establish connection with Gmail. Verify App Password.');
            fetchEmailsBtn.innerText = 'Fetch Security Emails';
            fetchEmailsBtn.disabled = false;
        }
    });

    function renderEmails(emails) {
        emailList.innerHTML = '';
        if (emails.length === 0) {
            emailList.innerHTML = '<div class="email-card"><h3>No security alerts found in session.</h3></div>';
            return;
        }

        emails.forEach(email => {
            const card = document.createElement('div');
            card.className = 'email-card';
            card.innerHTML = `
                <div class="card-meta">
                    <span class="sender">${email.sender.split('<')[0]}</span>
                    <span class="status-badge badge-alert">⚠️ ALERT</span>
                </div>
                <h3>${email.subject}</h3>
                <p>${email.body.substring(0, 100)}...</p>
            `;

            card.addEventListener('click', () => {
                // Select and Auto-Fill
                const senderEmail = email.sender.match(/<(.+)>/)?.[1] || email.sender;
                usernameInput.value = senderEmail;
                actionsInput.value = `Subject: ${email.subject}\n\n${email.body}`;
                
                // STEP 2 -> STEP 3: Expand Config
                step3.classList.remove('collapsed-section');
                step3.classList.add('expanded-section');
                
                // Smooth scroll to config
                step3.scrollIntoView({ behavior: 'smooth' });
                
                // Highlight config header
                const badge = step3.querySelector('.status-badge');
                badge.innerText = 'DATA INJECTED';
                badge.style.background = 'var(--success)';
            });

            emailList.appendChild(card);
        });
    }

    // STEP 3 -> STEP 4 -> STEP 5: Analyze and Show Results
    analyzeBtn.addEventListener('click', async () => {
        // Transition to Loader
        step3.classList.add('hidden');
        step4.classList.remove('hidden');
        step4.classList.add('visible');
        
        const payload = {
            username: usernameInput.value || 'unknown_node',
            login_attempts: loginAttemptsInput.value || 0,
            pages_accessed: pagesAccessedInput.value || 0,
            suspicious_actions: actionsInput.value || 'NONE',
            time_input: timeOfDayInput.value
        };

        try {
            const response = await fetch('/predict_intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            // Populate Results
            resUser.textContent = data.user;
            resIntent.textContent = data.intent;
            resConfidence.textContent = `${data.confidence}%`;
            resExplanation.textContent = data.explanation;
            resSuggestion.textContent = data.suggestion;
            resRisk.textContent = data.risk_level;

            // Apply Risk Styling
            resultCard.className = 'card result-summary'; // Reset
            resRisk.className = 'risk-pill';
            if (data.risk_level === 'High') {
                resultCard.classList.add('high-glow');
                resRisk.style.color = 'var(--danger)';
            } else if (data.risk_level === 'Medium') {
                resRisk.style.color = 'var(--warning)';
            } else {
                resRisk.style.color = 'var(--success)';
            }

            // Initialization Dashboard if first time
            if (!riskChart) {
                await initDashboard(data);
            } else {
                 await updateDashboard();
            }

            // Transition To Results
            setTimeout(() => {
                step4.classList.add('hidden');
                step5.classList.remove('hidden');
                step5.classList.add('visible');
                step5.scrollIntoView({ behavior: 'smooth' });
                speakIntel(data);
            }, 2000); // 2 second fake "AI processing" time for UX

        } catch (error) {
            console.error('Analysis Fault:', error);
            alert('Analysis Engine Timeout.');
            step4.classList.add('hidden');
            step3.classList.remove('hidden');
        }
    });

    function speakIntel(data) {
        const msg = new SpeechSynthesisUtterance(`Intel confirmed for ${data.user}. Risk level: ${data.risk_level}. Intent: ${data.intent}. ${data.explanation} Recommendation: ${data.suggestion}`);
        msg.rate = 1;
        msg.pitch = 0.85;
        window.speechSynthesis.speak(msg);
    }

    speakBtn.addEventListener('click', () => {
        speakIntel({
            user: resUser.textContent,
            risk_level: resRisk.textContent,
            intent: resIntent.textContent,
            explanation: resExplanation.textContent,
            suggestion: resSuggestion.textContent
        });
    });

    async function initDashboard() {
        const res = await fetch('/analytics');
        const data = await res.json();

        const ctxRisk = document.getElementById('riskChart').getContext('2d');
        riskChart = new Chart(ctxRisk, {
            type: 'bar',
            data: {
                labels: Object.keys(data.risk_distribution),
                datasets: [{ data: Object.values(data.risk_distribution), backgroundColor: ['#10b981', '#f59e0b', '#ef4444'], borderRadius: 10 }]
            },
            options: { plugins: { legend: { display: false } }, scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' } } } }
        });

        const ctxIntent = document.getElementById('intentChart').getContext('2d');
        intentChart = new Chart(ctxIntent, {
            type: 'doughnut',
            data: {
                labels: Object.keys(data.intent_categories),
                datasets: [{ data: Object.values(data.intent_categories), backgroundColor: ['#3b82f6', '#8b5cf6', '#ef4444', '#10b981'], borderWidth: 0 }]
            },
            options: { plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af', boxWidth: 10 } } } }
        });

        const ctxTimeline = document.getElementById('timelineChart').getContext('2d');
        timelineChart = new Chart(ctxTimeline, {
            type: 'line',
            data: {
                labels: ['01', '02', '03', '04', '05', '06', '07'],
                datasets: [{ data: data.timeline, borderColor: '#3b82f6', tension: 0.4, fill: false }]
            },
            options: { plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { grid: { display: false } } } }
        });
    }

    async function updateDashboard() {
        const res = await fetch('/analytics');
        const data = await res.json();
        riskChart.data.datasets[0].data = Object.values(data.risk_distribution);
        intentChart.data.datasets[0].data = Object.values(data.intent_categories);
        riskChart.update();
        intentChart.update();
    }
});
