async function getPostureInfo(identityData, apiPostureData) {
    try {
        if (identityData.error) {
            throw new Error(identityData.error);
        }

        const device = identityData.device_sessions?.[0]?.device || {};
        let devicePosture = identityData.device_posture || device.device_posture || {};

        if (apiPostureData?.result) {
            devicePosture = apiPostureData.result;
        }

        const rawChecks = Array.isArray(devicePosture.checks) ? devicePosture.checks : [];

        const checks = rawChecks.map(check => ({
            name: check.name || check.type || 'unnamed check',
            success: check.success === true
        }));

        return { checks };
    } catch (error) {
        console.error("Error processing posture info:", error);
        throw error;
    }
}
