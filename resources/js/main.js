function initApp() {
    Neutralino.init();

    Neutralino.events.on('windowClose', () => {
        Neutralino.app.exit();
    });

    const splashScreen = document.getElementById('splash-screen');
    const mainDashboard = document.getElementById('main-dashboard');
    const statusTitle = document.getElementById('installer-status-title');
    const statusDesc = document.getElementById('installer-status-desc');
    const logsContainer = document.getElementById('installer-logs');
    const spinner = document.getElementById('loading-spinner');
    const retryBtn = document.getElementById('retry-btn');
    const forceRetryBtn = document.getElementById('force-retry-btn');

    function appendLog(msg, type = 'info') {
        const div = document.createElement('div');
        div.className = type === 'error' ? 'text-red-400' : 
                        type === 'success' ? 'text-emerald-400' : 'text-slate-500';
        div.innerText = `> ${msg}`;
        logsContainer.appendChild(div);
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    Neutralino.events.on('INSTALLER_STATUS', (evt) => {
        const data = evt.detail;
        
        appendLog(`[${data.status}] ${data.payload}`);

        if (data.status === 'ERROR') {
            statusTitle.innerText = "Installation Error";
            statusTitle.className = "text-lg font-semibold text-red-400 mb-2";
            statusDesc.innerText = data.payload;
            spinner.style.borderColor = "rgba(239, 68, 68, 0.2)";
            spinner.style.borderTopColor = "#ef4444";
            spinner.style.display = 'none'; // Hide spinner on error
            retryBtn.classList.remove('hidden'); // Show retry button
            appendLog(data.payload, 'error');
        } 
        else if (data.status === 'MISSING') {
            statusTitle.innerText = "Dependencies Missing";
            statusTitle.className = "text-lg font-semibold text-slate-100 mb-2";
            statusDesc.innerText = data.payload;
            spinner.style.display = 'block';
            retryBtn.classList.add('hidden');
        }
        else if (data.status === 'INSTALLING') {
            statusTitle.innerText = "Installing Systems...";
            statusTitle.className = "text-lg font-semibold text-slate-100 mb-2";
            statusDesc.innerText = data.payload;
            spinner.style.display = 'block';
            retryBtn.classList.add('hidden');
        }
        else if (data.status === 'COMPLETE') {
            statusTitle.innerText = "Systems Ready";
            statusTitle.className = "text-lg font-semibold text-emerald-400 mb-2";
            statusDesc.innerText = data.payload;
            spinner.style.borderColor = "rgba(16, 185, 129, 0.2)";
            spinner.style.borderTopColor = "#10b981";
            spinner.style.display = 'block';
            retryBtn.classList.add('hidden');
            appendLog(data.payload, 'success');

            // Wait 1.5 seconds for users to see success state, then fade to main dashboard
            setTimeout(() => {
                splashScreen.classList.add('animate-fade-out');
                
                setTimeout(() => {
                    splashScreen.style.display = 'none';
                    mainDashboard.classList.remove('hidden');
                    mainDashboard.classList.add('animate-fade-in');
                }, 800); // Wait for fadeOut animation
            }, 1500);
        }
    });

    retryBtn.addEventListener('click', () => {
        appendLog("Retrying installer...");
        statusTitle.innerText = "Connecting...";
        statusTitle.className = "text-lg font-semibold text-slate-100 mb-2";
        statusDesc.innerText = "Re-initializing requirement checks...";
        spinner.style.display = 'block';
        spinner.style.borderColor = "rgba(255, 255, 255, 0.1)";
        spinner.style.borderTopColor = "#3b82f6";
        retryBtn.classList.add('hidden');
        
        if (typeof Neutralino !== 'undefined' && Neutralino.extensions) {
            Neutralino.extensions.dispatch('js.neutralino.installer', 'appReady')
                .then(() => {
                    appendLog("appReady successfully dispatched for retry.");
                })
                .catch((err) => {
                    appendLog(`Failed to dispatch retry: ${JSON.stringify(err)}`, 'error');
                });
        }
    });

    forceRetryBtn.addEventListener('click', () => {
        appendLog("Initiating user-requested force reinstall...");
        
        // Show splash screen, hide dashboard
        splashScreen.style.display = 'flex';
        splashScreen.classList.remove('animate-fade-out');
        splashScreen.style.opacity = '1';
        mainDashboard.classList.add('hidden');
        mainDashboard.classList.remove('animate-fade-in');
        
        // Reset splash screen UI state
        statusTitle.innerText = "Resetting Binaries...";
        statusTitle.className = "text-lg font-semibold text-slate-100 mb-2";
        statusDesc.innerText = "Wiping local binary installations...";
        spinner.style.display = 'block';
        spinner.style.borderColor = "rgba(255, 255, 255, 0.1)";
        spinner.style.borderTopColor = "#3b82f6";
        retryBtn.classList.add('hidden');
        
        // Reset terminal logs
        logsContainer.innerHTML = '<div class="text-blue-500">> Resetting local bin environment...</div>';
        
        // Dispatch forceRetry event
        if (typeof Neutralino !== 'undefined' && Neutralino.extensions) {
            Neutralino.extensions.dispatch('js.neutralino.installer', 'forceRetry')
                .then(() => {
                    appendLog("forceRetry event successfully dispatched.");
                })
                .catch((err) => {
                    appendLog(`Failed to dispatch forceRetry: ${JSON.stringify(err)}`, 'error');
                });
        }
    });

    // Send a message that UI is ready and dispatch appReady to the extension
    appendLog("UI Initialized. Dispatching appReady event to installer...");
    if (typeof Neutralino !== 'undefined' && Neutralino.extensions) {
        Neutralino.extensions.dispatch('js.neutralino.installer', 'appReady')
            .then(() => {
                appendLog("appReady event acknowledged.");
            })
            .catch((err) => {
                appendLog(`Failed to dispatch appReady: ${JSON.stringify(err)}`, 'error');
            });
    } else {
        appendLog("Neutralino extensions API not available.", 'error');
    }
}

window.addEventListener('DOMContentLoaded', initApp);
