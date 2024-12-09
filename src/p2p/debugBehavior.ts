// Track oscillation state
let isDelaying = false;
let lastToggleTime = 0;
const OSCILLATION_PERIOD = 30000; // 30 seconds
const BAD_BEHAVIOR_DURATION = 15000; // 15 seconds
const RESPONSE_DELAY = 8000; // 8 second delay during bad behavior

// Flag to enable/disable debug behavior
let debugOscillatingBehavior = false;

export function setDebugOscillatingBehavior(enabled: boolean): void {
    debugOscillatingBehavior = enabled;
    console.log(`[Debug Behavior] ${enabled ? 'Enabled' : 'Disabled'} oscillating behavior`);
}

export function shouldDelayResponse(): boolean {
    if (!debugOscillatingBehavior) {
        return false;
    }

    const now = Date.now();
    
    // Toggle behavior state every OSCILLATION_PERIOD
    if (now - lastToggleTime > OSCILLATION_PERIOD) {
        isDelaying = !isDelaying;
        lastToggleTime = now;
        console.log(`[Debug Behavior] Switching to ${isDelaying ? 'bad' : 'good'} behavior mode`);
    }

    // If we're in bad behavior mode and haven't exceeded the duration
    if (isDelaying && now - lastToggleTime < BAD_BEHAVIOR_DURATION) {
        return true;
    }

    return false;
}

export function getResponseDelay(): number {
    return shouldDelayResponse() ? RESPONSE_DELAY : 0;
}

// For monitoring purposes
export function getCurrentBehaviorState(): string {
    if (!debugOscillatingBehavior) {
        return 'Normal (Debug Mode Disabled)';
    }
    return isDelaying ? 'Bad (Delaying Responses)' : 'Good (Normal Operation)';
}

// For use in isDownCheck
export function shouldReportDown(): boolean {
    return shouldDelayResponse() && Math.random() < 0.2; // 20% chance to report as down during bad behavior
} 