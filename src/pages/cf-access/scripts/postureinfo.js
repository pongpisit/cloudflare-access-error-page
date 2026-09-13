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
            .map(check => ({
                name: check.rule_name || check.name || check.type || 'unnamed check',
                success: check.success === true,
                error: check.error || null,
                type: check.type || null
            }));

        return { checks };
    } catch (error) {
        console.error("Error processing posture info:", error);
        throw error;
    }
}
