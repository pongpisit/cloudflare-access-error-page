async function getDeviceInfo(identityData, deviceId, apiDeviceData) {
  try {
    if (identityData.error) {
      throw new Error(identityData.error);
    }

    // Get device info from identity data (device_sessions array)
    const device = identityData.device_sessions?.[0]?.device || {};
    
    // Prioritize API device data if available (from Cloudflare API)
    // API response structure: { result: { id, name, model, os_version, serial_number } }
    const apiDevice = apiDeviceData?.result || {};

    const osVersion = [apiDevice.os_version || device.os_version, apiDevice.os_version_extra || device.os_version_extra]
      .filter(Boolean)
      .join(' · ');

    const result = {
      deviceId: deviceId || apiDevice.id || device.id || "N/A",
      deviceName: apiDevice.name || device.name || "N/A",
      deviceType: apiDevice.device_type || device.device_type || null,
      deviceModel: apiDevice.model || device.model || "N/A",
      deviceOsVersion: osVersion || "N/A",
      deviceSerial: apiDevice.serial_number || device.serial_number || device.serial || "N/A",
      deviceMac: apiDevice.mac_address || device.mac_address || null,
      deviceIp: apiDevice.ip || device.ip || null,
      clientVersion: apiDevice.version || null,
      lastSeen: apiDevice.last_seen || device.last_seen || null
    };
    
    return result;
  } catch (error) {
    throw error;
  }
}
