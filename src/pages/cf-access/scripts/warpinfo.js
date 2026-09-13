async function getWarpInfo(identityData) {
  try {
    if (identityData.error) {
      throw new Error(identityData.error);
    }

    const traceResponse = await fetch("https://www.cloudflare.com/cdn-cgi/trace");
    const traceText = await traceResponse.text();
    const warpStatus = traceText.includes("warp=on");

    // Extract user groups from identity data
    const groupsArray = identityData.groups || identityData.user_groups || [];
    
    // Groups might be objects with name/email properties, extract the names
    const userGroups = groupsArray.map(group => {
      if (typeof group === 'string') return group;
      return group.name || group.email || group.id || 'Unknown Group';
    });

    const result = {
      userName: identityData.name || "N/A",
      userEmail: identityData.email || "N/A",
      isWarpEnabled: warpStatus,
      userGroups: userGroups,
      userCountry: (identityData.geo && identityData.geo.country) || null,
      userIp: identityData.ip || null
    };
    
    return result;
  } catch (error) {
    console.error("Error processing user info:", error);
    throw error;
  }
}
