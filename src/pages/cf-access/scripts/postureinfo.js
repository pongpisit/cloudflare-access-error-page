async function getPostureInfo(identityData, apiPostureData) {
    try {
        if (identityData.error) {
            throw new Error(identityData.error);
        }

        let devicePosture = null;

        if (apiPostureData && apiPostureData.result) {
            devicePosture = apiPostureData.result;
        }

        if (!devicePosture) {
            const identityPosture = identityData.devicePosture || identityData.device_posture;
            const device = identityData.device_sessions && identityData.device_sessions[0]
                ? identityData.device_sessions[0].device
                : {};
            devicePosture = identityPosture || device.device_posture || {};
        }

        let rawChecks = [];
        if (Array.isArray(devicePosture)) {
            rawChecks = devicePosture;
        } else if (Array.isArray(devicePosture.checks)) {
            rawChecks = devicePosture.checks;
        } else if (devicePosture && typeof devicePosture === 'object') {
            rawChecks = Object.values(devicePosture);
        }

        const checks = rawChecks
            .filter(check => check && typeof check === 'object')
            .map(check => {
                let state;
                if (check.success === true) {
                    state = 'pass';
                } else if (String(check.error || '').toLowerCase().includes('not checked')) {
                    state = 'skipped';
                } else {
                    state = 'fail';
                }
                return {
                    name: check.rule_name || check.name || check.type || 'unnamed check',
                    type: check.type || null,
                    error: check.error || null,
                    success: check.success === true,
                    state
                };
            });

        const stateOrder = { fail: 0, skipped: 1, pass: 2 };
        checks.sort((a, b) => (stateOrder[a.state] !== undefined ? stateOrder[a.state] : 3) - (stateOrder[b.state] !== undefined ? stateOrder[b.state] : 3));

        const summary = {
            total: checks.length,
            failed: checks.filter(c => c.state === 'fail').length,
            passed: checks.filter(c => c.state === 'pass').length,
            notChecked: checks.filter(c => c.state === 'skipped').length
        };

        return { checks, summary };
    } catch (error) {
        console.error("Error processing posture info:", error);
        throw error;
    }
}
