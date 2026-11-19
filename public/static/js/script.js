document.addEventListener('DOMContentLoaded', () => {
    const FETCH_TIMEOUT_MS = 35000;
    const HEALTH_TIMEOUT_MS = 25000;
    const ORIGINAL_FETCH_LABEL = '📥 Fetch Security Emails';

    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3');
    const step4 = document.getElementById('step4');
    const step5 = document.getElementById('step5');

    const fetchEmailsBtn = document.getElementById('fetchEmailsBtn');
    const emailList = document.getElementById('emailList');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const progressFill = document.getElementById('progressFill');

    const usernameInput = document.getElementById('username');
    const loginAttemptsInput = document.getElementById('loginAttempts');
    const pagesAccessedInput = document.getElementById('pagesAccessed');
    const actionsInput = document.getElementById('actions');
    const timeOfDayInput = document.getElementById('timeOfDay');

    const resUser = document.getElementById('resUser');
    const resIntent = document.getElementById('resIntent');
    const resRisk = document.getElementById('resRisk');
    const resConfidence = document.getElementById('resConfidence');
    const resExplanation = document.getElementById('resExplanation');
    const resSuggestion = document.getElementById('resSuggestion');
    const riskIndicator = document.getElementById('riskIndicator');
    const speakBtn = document.getElementById('speakBtn');

    const statusTargets = {
        intel: {
            container: document.getElementById('intelStatus'),
            text: document.getElementById('intelStatusText'),
            detail: document.getElementById('intelStatusDetail'),
        },
        analysis: {
            container: document.getElementById('analysisStatus'),
            text: document.getElementById('analysisStatusText'),
            detail: document.getElementById('analysisStatusDetail'),
        },
    };

    let riskChart, intentChart, timelineChart;

    class SyncError extends Error {
        constructor(message, code = 'unknown', action = '') {
            super(message);
            this.name = 'SyncError';
            this.code = code;
            this.action = action;
        }
    }

    function normalizeError(error) {
        if (error instanceof SyncError) return error;
        return new SyncError('An unexpected client error occurred.', 'client_error');
    }

    function setStatus(targetName, state, text, detail = '') {
        const target = statusTargets[targetName];
        if (!target || !target.container) return;
        target.container.hidden = false;
        target.container.dataset.state = state;
        target.text.textContent = text;
        target.detail.textContent = detail;
        target.detail.hidden = !detail;
    }

    function clearStatus(targetName) {
        const target = statusTargets[targetName];
        if (!target || !target.container) return;
        target.container.hidden = true;
        target.container.dataset.state = 'idle';
        target.text.textContent = '';
        target.detail.textContent = '';
    }

    function statusTitleForCode(code, fallback) {
        const titles = {
            not_configured: 'INTELLIGENCE PROVIDER NOT CONFIGURED',
            auth_failed: 'INTELLIGENCE CREDENTIALS REJECTED',
            rate_limited: 'INTELLIGENCE PROVIDER RATE-LIMITED',
            timeout: 'INTELLIGENCE LINK TIMED OUT',
            network_error: 'INTELLIGENCE LINK UNREACHABLE',
            tls_error: 'SECURE INTELLIGENCE LINK FAILED',
            imap_disabled: 'GMAIL IMAP ACCESS IS DISABLED',
            provider_rejected: 'INTELLIGENCE PROVIDER REJECTED THE REQUEST',
            provider_error: 'INTELLIGENCE PROVIDER FAILURE',
            bad_response: 'DEPLOYMENT RESPONSE INVALID',
            client_timeout: 'INTELLIGENCE LINK TIMED OUT',
            client_error: 'INTELLIGENCE CLIENT ERROR',
        };
        return titles[code] || fallback;
    }

    function describeError(error) {
        if (!error.action) return error.message;
        return `${error.message} ${error.action}`;
    }

    async function fetchJson(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response;

        try {
            response = await fetch(url, {
                cache: 'no-store',
                ...options,
                signal: controller.signal,
                headers: {
                    Accept: 'application/json',
                    ...(options.headers || {}),
                },
            });
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new SyncError('The request exceeded the client timeout.', 'client_timeout', 'Retry the sync.');
            }
            throw new SyncError('The server could not be reached.', 'network_error', 'Check the deployment and retry.');
        } finally {
            clearTimeout(timer);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            throw new SyncError(
                `The server returned a non-JSON response (HTTP ${response.status}).`,
                'bad_response',
                'Verify that the Vercel Flask deployment is active and retry.'
            );
        }

        let payload;
        try {
            payload = await response.json();
        } catch (error) {
            throw new SyncError('The server response could not be parsed.', 'bad_response', 'Retry the sync.');
        }

        if (!response.ok) {
            throw new SyncError(
                payload.error || payload.message || `The provider returned HTTP ${response.status}.`,
                payload.code || 'provider_error',
                payload.action || ''
            );
        }

        return payload;
    }

    async function checkIntelligenceHealth() {
        setStatus('intel', 'loading', 'CHECKING INTELLIGENCE LINK', 'Contacting the Gmail IMAP provider...');
        try {
            const health = await fetchJson('/health/intelligence', {}, HEALTH_TIMEOUT_MS);
            if (health.status !== 'ok') {
                throw new SyncError('The intelligence provider did not report a healthy state.', 'provider_error');
            }
            if (fetchEmailsBtn.disabled) return;
            setStatus(
                'intel',
                'success',
                'INTELLIGENCE LINK ONLINE',
                `Gmail IMAP verified in ${health.latency_ms} ms.`
            );
        } catch (error) {
            const syncError = normalizeError(error);
            if (fetchEmailsBtn.disabled) return;
            console.warn('Intelligence health check failed:', syncError.code);
            setStatus(
                'intel',
                'error',
                statusTitleForCode(syncError.code, 'INTELLIGENCE LINK OFFLINE'),
                describeError(syncError)
            );
        }
    }

    fetchEmailsBtn.addEventListener('click', async () => {
        if (fetchEmailsBtn.disabled) return;

        fetchEmailsBtn.disabled = true;
        fetchEmailsBtn.dataset.loading = 'true';
        fetchEmailsBtn.textContent = '🛡️ SYNCING INTEL...';
        clearStatus('analysis');
        setStatus('intel', 'loading', 'SYNCING INTEL', 'Connecting to the Gmail IMAP intelligence provider...');

        try {
            const emails = await fetchJson('/fetch_emails');

            if (!Array.isArray(emails)) {
                throw new SyncError('The intelligence provider returned an invalid payload.', 'bad_response');
            }

            renderEmailFocus(emails);
            step2.classList.remove('hidden');
            step2.scrollIntoView({ behavior: 'smooth' });

            if (emails.length === 0) {
                setStatus(
                    'intel',
                    'warning',
                    'SYNC COMPLETE — NO MATCHING ALERTS',
                    'The provider is reachable, but no security keywords were found in the latest 20 messages.'
                );
            } else {
                const label = emails.length === 1 ? 'ALERT' : 'ALERTS';
                setStatus(
                    'intel',
                    'success',
                    `SYNC COMPLETE — ${emails.length} ${label}`,
                    'Threat intelligence is ready. Select an alert to start analysis.'
                );
            }
        } catch (error) {
            const syncError = normalizeError(error);
            console.error('Intelligence sync failed:', syncError.code);
            setStatus(
                'intel',
                'error',
                statusTitleForCode(syncError.code, 'INTELLIGENCE SOURCE UNAVAILABLE'),
                describeError(syncError)
            );
        } finally {
            fetchEmailsBtn.disabled = false;
            delete fetchEmailsBtn.dataset.loading;
            fetchEmailsBtn.textContent = ORIGINAL_FETCH_LABEL;
        }
    });

    function renderEmailFocus(emails) {
        emailList.innerHTML = '';

        if (!Array.isArray(emails) || emails.length === 0) {
            const emptyCard = document.createElement('div');
            emptyCard.className = 'card';
            const emptyText = document.createElement('p');
            emptyText.style.textAlign = 'center';
            emptyText.textContent = 'No high-priority security alerts found in this session.';
            emptyCard.appendChild(emptyText);
            emailList.appendChild(emptyCard);
            return;
        }

        emails.forEach((email) => {
            const card = document.createElement('div');
            card.className = 'email-item';
            card.tabIndex = 0;
            card.setAttribute('role', 'button');

            const senderText = typeof email.sender === 'string' ? email.sender : '';
            const subjectText = typeof email.subject === 'string' ? email.subject : 'Untitled alert';
            const bodyText = typeof email.body === 'string' ? email.body : '';

            const sender = document.createElement('span');
            sender.className = 'sender';
            sender.textContent = `FROM: ${senderText.split(' ')[0] || 'Unknown sender'}`;

            const subject = document.createElement('h4');
            subject.textContent = `🚨 ${subjectText}`;

            const preview = document.createElement('p');
            preview.textContent = `${bodyText.substring(0, 150)}...`;

            card.append(sender, subject, preview);

            card.addEventListener('click', () => {
                document.querySelectorAll('.email-item').forEach((el) => el.classList.remove('active'));
                card.classList.add('active');
                autoPopulate({ ...email, sender: senderText, subject: subjectText, body: bodyText });
                step3.classList.remove('collapsed');
                step3.classList.add('expanded');
                setTimeout(() => {
                    step3.scrollIntoView({ behavior: 'smooth' });
                }, 100);
            });

            card.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    card.click();
                }
            });

            emailList.appendChild(card);
        });
    }

    function autoPopulate(email) {
        const sender = email.sender || 'unknown';
        usernameInput.value = sender.match(/<(.+)>/)?.[1] || sender.split(' ')[0] || 'unknown';
        actionsInput.value = `INTEL_REPORT: ${email.subject}\n\nCONTENT: ${email.body}`;
        loginAttemptsInput.value = email.subject.toLowerCase().includes('failed') ? 8 : 1;
        pagesAccessedInput.value = Math.floor(Math.random() * 40) + 5;
    }

    analyzeBtn.addEventListener('click', async () => {
        if (analyzeBtn.disabled) return;

        analyzeBtn.disabled = true;
        clearStatus('analysis');
        step4.classList.remove('hidden');
        step4.scrollIntoView({ behavior: 'smooth' });

        let width = 0;
        progressFill.style.width = '0%';
        const interval = setInterval(() => {
            if (width >= 100) {
                clearInterval(interval);
                return;
            }
            width += 2;
            progressFill.style.width = `${width}%`;
        }, 30);

        const payload = {
            username: usernameInput.value || 'unknown_node',
            login_attempts: loginAttemptsInput.value || 0,
            pages_accessed: pagesAccessedInput.value || 0,
            suspicious_actions: actionsInput.value || 'NONE',
            time_input: timeOfDayInput.value,
        };

        try {
            const data = await fetchJson('/predict_intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!data || typeof data !== 'object' || !data.intent) {
                throw new SyncError('The analysis engine returned an invalid payload.', 'bad_response');
            }

            resUser.textContent = data.user;
            resIntent.textContent = data.intent;
            resConfidence.textContent = `${data.confidence}%`;
            resExplanation.textContent = data.explanation;
            resSuggestion.textContent = data.suggestion;
            resRisk.textContent = data.risk_level;

            resRisk.className = 'risk-text';
            if (data.risk_level === 'High') {
                resRisk.classList.add('risk-high');
                riskIndicator.style.background = 'var(--danger)';
            } else if (data.risk_level === 'Medium') {
                resRisk.classList.add('risk-medium');
                riskIndicator.style.background = 'var(--warning)';
            } else {
                resRisk.classList.add('risk-low');
                riskIndicator.style.background = 'var(--success)';
            }

            progressFill.style.width = '100%';
            clearInterval(interval);

            setTimeout(() => {
                step4.classList.add('hidden');
                step5.classList.remove('hidden');
                step5.scrollIntoView({ behavior: 'smooth' });
                syncDashboard().catch((error) => {
                    console.warn('Dashboard refresh failed:', normalizeError(error).code);
                });
                speakIntel(data);
            }, 2500);
        } catch (error) {
            const syncError = normalizeError(error);
            console.error('Analysis fault:', syncError.code);
            clearInterval(interval);
            progressFill.style.width = '0%';
            step4.classList.add('hidden');
            setStatus(
                'analysis',
                'error',
                statusTitleForCode(syncError.code, 'ANALYSIS ENGINE ERROR'),
                describeError(syncError)
            );
        } finally {
            analyzeBtn.disabled = false;
        }
    });

    function speakIntel(data) {
        if (!('speechSynthesis' in window)) return;
        const synth = window.speechSynthesis;
        const msg = new SpeechSynthesisUtterance(
            `Warning. Node ${data.user} shows ${data.risk_level} risk behavior. Intent identified as ${data.intent}. Protocol requested: ${data.suggestion}`
        );
        msg.rate = 0.9;
        msg.pitch = 0.8;
        synth.speak(msg);
    }

    speakBtn.addEventListener('click', () => {
        speakIntel({
            user: resUser.textContent,
            risk_level: resRisk.textContent,
            intent: resIntent.textContent,
            suggestion: resSuggestion.textContent,
        });
    });

    async function initDashboard() {
        if (typeof Chart === 'undefined') {
            console.warn('Dashboard charts unavailable: Chart.js was not loaded.');
            return;
        }

        try {
            const data = await fetchJson('/analytics', {}, HEALTH_TIMEOUT_MS);

            const ctxRisk = document.getElementById('riskChart').getContext('2d');
            riskChart = new Chart(ctxRisk, {
                type: 'bar',
                data: {
                    labels: Object.keys(data.risk_distribution),
                    datasets: [{
                        data: Object.values(data.risk_distribution),
                        backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                        borderRadius: 10,
                    }],
                },
                options: {
                    plugins: { legend: { display: false } },
                    scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' } } },
                },
            });

            const ctxIntent = document.getElementById('intentChart').getContext('2d');
            intentChart = new Chart(ctxIntent, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(data.intent_categories),
                    datasets: [{
                        data: Object.values(data.intent_categories),
                        backgroundColor: ['#3b82f6', '#8b5cf6', '#ef4444', '#10b981'],
                        borderWidth: 0,
                    }],
                },
                options: {
                    plugins: { legend: { position: 'bottom', labels: { color: '#64748b' } } },
                },
            });

            const ctxTimeline = document.getElementById('timelineChart').getContext('2d');
            timelineChart = new Chart(ctxTimeline, {
                type: 'line',
                data: {
                    labels: ['01', '02', '03', '04', '05', '06', '07'],
                    datasets: [{
                        data: data.timeline,
                        borderColor: '#00f2fe',
                        tension: 0.4,
                        fill: true,
                        backgroundColor: 'rgba(0, 242, 254, 0.05)',
                    }],
                },
                options: { plugins: { legend: { display: false } }, scales: { y: { display: false } } },
            });
        } catch (error) {
            console.warn('Dashboard initialization failed:', normalizeError(error).code);
        }
    }

    async function syncDashboard() {
        if (!riskChart || !intentChart) return;
        const data = await fetchJson('/analytics', {}, HEALTH_TIMEOUT_MS);
        riskChart.data.datasets[0].data = Object.values(data.risk_distribution);
        intentChart.data.datasets[0].data = Object.values(data.intent_categories);
        riskChart.update();
        intentChart.update();
    }

    checkIntelligenceHealth();
    initDashboard();
});
